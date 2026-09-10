import Foundation
import CoreGraphics

/// Plan-space geometry.
///
/// Everything in this file is deliberately free of RoomPlan and ARKit, so the
/// math can be reasoned about (and unit tested) on its own, and so a saved plan
/// can be re-drawn without decoding a scan.
///
/// Convention: plan space is metres, x runs east, y runs *south* (it is the
/// world's +z axis). Screen space flips y so that north points up.

struct PlanPoint: Codable, Hashable {
    var x: Double
    var y: Double

    static let zero = PlanPoint(x: 0, y: 0)

    var cgPoint: CGPoint { CGPoint(x: x, y: y) }

    func distance(to other: PlanPoint) -> Double {
        hypot(other.x - x, other.y - y)
    }

    func midpoint(_ other: PlanPoint) -> PlanPoint {
        PlanPoint(x: (x + other.x) / 2, y: (y + other.y) / 2)
    }

    func translated(dx: Double, dy: Double) -> PlanPoint {
        PlanPoint(x: x + dx, y: y + dy)
    }
}

struct PlanRect: Codable, Hashable {
    var minX: Double
    var minY: Double
    var maxX: Double
    var maxY: Double

    var width: Double { max(0, maxX - minX) }
    var height: Double { max(0, maxY - minY) }
    var center: PlanPoint { PlanPoint(x: (minX + maxX) / 2, y: (minY + maxY) / 2) }
    var isEmpty: Bool { width <= 0 && height <= 0 }

    static let null = PlanRect(minX: .infinity, minY: .infinity, maxX: -.infinity, maxY: -.infinity)

    mutating func expand(to point: PlanPoint) {
        minX = Swift.min(minX, point.x)
        minY = Swift.min(minY, point.y)
        maxX = Swift.max(maxX, point.x)
        maxY = Swift.max(maxY, point.y)
    }

    /// Grows the rectangle on every side, for drawing margin.
    func expanded(by amount: Double) -> PlanRect {
        PlanRect(minX: minX - amount, minY: minY - amount, maxX: maxX + amount, maxY: maxY + amount)
    }

    func union(_ other: PlanRect) -> PlanRect {
        guard !other.isNull else { return self }
        guard !isNull else { return other }
        return PlanRect(minX: Swift.min(minX, other.minX),
                        minY: Swift.min(minY, other.minY),
                        maxX: Swift.max(maxX, other.maxX),
                        maxY: Swift.max(maxY, other.maxY))
    }

    var isNull: Bool { minX > maxX || minY > maxY }
}

enum PlanGeometry {
    /// Signed-area (shoelace) of a closed polygon, in square metres.
    static func area(of polygon: [PlanPoint]) -> Double {
        guard polygon.count >= 3 else { return 0 }
        var sum = 0.0
        for index in polygon.indices {
            let a = polygon[index]
            let b = polygon[(index + 1) % polygon.count]
            sum += (a.x * b.y) - (b.x * a.y)
        }
        return abs(sum) / 2
    }

    static func perimeter(of polygon: [PlanPoint]) -> Double {
        guard polygon.count >= 2 else { return 0 }
        var total = 0.0
        for index in polygon.indices {
            total += polygon[index].distance(to: polygon[(index + 1) % polygon.count])
        }
        return total
    }

    static func centroid(of polygon: [PlanPoint]) -> PlanPoint {
        guard !polygon.isEmpty else { return .zero }
        // Area-weighted centroid; falls back to the average of the vertices for
        // degenerate (zero-area) input.
        var signedArea = 0.0
        var cx = 0.0
        var cy = 0.0
        for index in polygon.indices {
            let a = polygon[index]
            let b = polygon[(index + 1) % polygon.count]
            let cross = (a.x * b.y) - (b.x * a.y)
            signedArea += cross
            cx += (a.x + b.x) * cross
            cy += (a.y + b.y) * cross
        }
        signedArea /= 2
        guard abs(signedArea) > 1e-9 else {
            let sumX = polygon.reduce(0) { $0 + $1.x }
            let sumY = polygon.reduce(0) { $0 + $1.y }
            return PlanPoint(x: sumX / Double(polygon.count), y: sumY / Double(polygon.count))
        }
        return PlanPoint(x: cx / (6 * signedArea), y: cy / (6 * signedArea))
    }

    static func bounds(of points: [PlanPoint]) -> PlanRect {
        var rect = PlanRect.null
        for point in points { rect.expand(to: point) }
        return rect
    }

    /// Andrew's monotone chain. Used to close a footprint when RoomPlan does not
    /// hand us a floor polygon (older scans, or a room it could not close).
    static func convexHull(of points: [PlanPoint]) -> [PlanPoint] {
        guard points.count >= 3 else { return points }
        let sorted = points.sorted { $0.x == $1.x ? $0.y < $1.y : $0.x < $1.x }

        func cross(_ o: PlanPoint, _ a: PlanPoint, _ b: PlanPoint) -> Double {
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
        }

        var lower: [PlanPoint] = []
        for point in sorted {
            while lower.count >= 2, cross(lower[lower.count - 2], lower[lower.count - 1], point) <= 0 {
                lower.removeLast()
            }
            lower.append(point)
        }

        var upper: [PlanPoint] = []
        for point in sorted.reversed() {
            while upper.count >= 2, cross(upper[upper.count - 2], upper[upper.count - 1], point) <= 0 {
                upper.removeLast()
            }
            upper.append(point)
        }

        lower.removeLast()
        upper.removeLast()
        return lower + upper
    }

    /// Snaps a heading to the nearest right angle when it is within `tolerance`
    /// radians of one. Hand-held scans are rarely square to the millimetre, and
    /// a plan that is one degree off reads as sloppy.
    static func squared(angle: Double, tolerance: Double = 3 * .pi / 180) -> Double {
        let quarter = Double.pi / 2
        let nearest = (angle / quarter).rounded() * quarter
        return abs(angle - nearest) <= tolerance ? nearest : angle
    }

    /// Point at `fraction` along the segment a→b.
    static func lerp(_ a: PlanPoint, _ b: PlanPoint, _ fraction: Double) -> PlanPoint {
        PlanPoint(x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction)
    }

    /// Projects `point` onto the infinite line through a→b and returns how far
    /// along that line it lands, as a fraction (which may fall outside 0...1).
    static func projectionFraction(of point: PlanPoint, onto a: PlanPoint, _ b: PlanPoint) -> Double {
        let dx = b.x - a.x
        let dy = b.y - a.y
        let lengthSquared = (dx * dx) + (dy * dy)
        guard lengthSquared > 1e-9 else { return 0 }
        return (((point.x - a.x) * dx) + ((point.y - a.y) * dy)) / lengthSquared
    }
}
