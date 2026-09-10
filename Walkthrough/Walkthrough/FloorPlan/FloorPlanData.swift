import Foundation

/// A drawable floor plan: what a scan becomes once the 3D geometry has been
/// flattened. It is `Codable` and stored alongside the project, so a plan can be
/// listed, drawn, printed and shared without re-decoding the scan it came from.

enum OpeningKind: String, Codable, Hashable {
    case door
    case openDoor
    case window
    case opening

    var isDoor: Bool { self == .door || self == .openDoor }

    var displayName: String {
        switch self {
        case .door, .openDoor: return "Door"
        case .window: return "Window"
        case .opening: return "Opening"
        }
    }
}

/// The furnishings RoomPlan recognises. Mapped from the framework's own
/// category names by string, so a new category in a future iOS release degrades
/// to `.unknown` instead of failing to compile.
enum PlanObjectCategory: String, Codable, Hashable, CaseIterable {
    case bathtub, bed, chair, dishwasher, fireplace, oven, refrigerator
    case sink, sofa, stairs, storage, stove, table, television, toilet
    case washerDryer, unknown

    init(roomPlanDescription: String) {
        let normalized = roomPlanDescription
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "_", with: "")
        // e.g. "washerDryer", "storage", "door(isOpen: true)"
        let head = normalized.split(separator: "(").first.map(String.init) ?? normalized
        self = PlanObjectCategory(rawValue: head) ?? .unknown
    }

    var displayName: String {
        switch self {
        case .washerDryer: return "Washer / dryer"
        case .television: return "TV"
        case .unknown: return "Object"
        default: return rawValue.prefix(1).uppercased() + rawValue.dropFirst()
        }
    }

    var symbolName: String {
        switch self {
        case .bathtub: return "bathtub"
        case .bed: return "bed.double"
        case .chair: return "chair"
        case .dishwasher, .washerDryer: return "washer"
        case .fireplace: return "fireplace"
        case .oven, .stove: return "oven"
        case .refrigerator: return "refrigerator"
        case .sink: return "sink"
        case .sofa: return "sofa"
        case .stairs: return "stairs"
        case .storage: return "cabinet"
        case .table: return "table.furniture"
        case .television: return "tv"
        case .toilet: return "toilet"
        case .unknown: return "cube"
        }
    }
}

struct PlanWall: Codable, Hashable, Identifiable {
    var id: UUID = UUID()
    var start: PlanPoint
    var end: PlanPoint
    var thickness: Double
    var height: Double
    /// Room-level grouping, so a merged multi-room plan can still tint or label
    /// per room.
    var roomID: UUID?

    var length: Double { start.distance(to: end) }
    var angle: Double { atan2(end.y - start.y, end.x - start.x) }
}

struct PlanOpening: Codable, Hashable, Identifiable {
    var id: UUID = UUID()
    var kind: OpeningKind
    var start: PlanPoint
    var end: PlanPoint
    var height: Double
    /// Height of the sill above the floor. Windows sit above it; doors are ~0.
    var sillHeight: Double
    var roomID: UUID?

    var width: Double { start.distance(to: end) }
    var angle: Double { atan2(end.y - start.y, end.x - start.x) }
}

struct PlanObject: Codable, Hashable, Identifiable {
    var id: UUID = UUID()
    var category: PlanObjectCategory
    var center: PlanPoint
    /// Footprint size in metres: width along the object's own x axis, depth
    /// along its z axis.
    var size: PlanPoint
    /// Rotation of the object's x axis within the plan, in radians.
    var rotation: Double
    var heightAboveFloor: Double
    var roomID: UUID?
}

struct PlanRoomOutline: Codable, Hashable, Identifiable {
    var id: UUID = UUID()
    var roomID: UUID?
    var name: String
    var polygon: [PlanPoint]

    var area: Double { PlanGeometry.area(of: polygon) }
    var perimeter: Double { PlanGeometry.perimeter(of: polygon) }
    var labelAnchor: PlanPoint { PlanGeometry.centroid(of: polygon) }
}

struct FloorPlanData: Codable, Hashable {
    var walls: [PlanWall] = []
    var openings: [PlanOpening] = []
    var objects: [PlanObject] = []
    var outlines: [PlanRoomOutline] = []
    var ceilingHeight: Double = 0
    /// True when the plan came from a single scan or a real merge, false when
    /// rooms were arranged side by side because their raw scan data was gone.
    var isSpatiallyTrue: Bool = true

    static let empty = FloorPlanData()

    var isEmpty: Bool { walls.isEmpty && outlines.isEmpty && objects.isEmpty }

    /// Floor area in square metres. Prefers the scanned floor outline; falls
    /// back to the footprint the walls enclose.
    var floorArea: Double {
        let outlineArea = outlines.reduce(0) { $0 + $1.area }
        if outlineArea > 0.5 { return outlineArea }
        return PlanGeometry.area(of: PlanGeometry.convexHull(of: wallEndpoints))
    }

    var wallPerimeter: Double {
        if let outline = outlines.first, outlines.count == 1, outline.polygon.count >= 3 {
            return outline.perimeter
        }
        return walls.reduce(0) { $0 + $1.length }
    }

    var wallEndpoints: [PlanPoint] {
        walls.flatMap { [$0.start, $0.end] }
    }

    var bounds: PlanRect {
        var rect = PlanGeometry.bounds(of: wallEndpoints)
        for outline in outlines {
            rect = rect.union(PlanGeometry.bounds(of: outline.polygon))
        }
        for object in objects {
            let reach = max(object.size.x, object.size.y) / 2
            rect.expand(to: object.center.translated(dx: -reach, dy: -reach))
            rect.expand(to: object.center.translated(dx: reach, dy: reach))
        }
        return rect.isNull ? PlanRect(minX: 0, minY: 0, maxX: 1, maxY: 1) : rect
    }

    func counts(of kind: OpeningKind) -> Int {
        openings.filter { $0.kind == kind || (kind == .door && $0.kind == .openDoor) }.count
    }

    func translated(dx: Double, dy: Double) -> FloorPlanData {
        var copy = self
        copy.walls = walls.map {
            var wall = $0
            wall.start = $0.start.translated(dx: dx, dy: dy)
            wall.end = $0.end.translated(dx: dx, dy: dy)
            return wall
        }
        copy.openings = openings.map {
            var opening = $0
            opening.start = $0.start.translated(dx: dx, dy: dy)
            opening.end = $0.end.translated(dx: dx, dy: dy)
            return opening
        }
        copy.objects = objects.map {
            var object = $0
            object.center = $0.center.translated(dx: dx, dy: dy)
            return object
        }
        copy.outlines = outlines.map {
            var outline = $0
            outline.polygon = $0.polygon.map { $0.translated(dx: dx, dy: dy) }
            return outline
        }
        return copy
    }

    /// Recentres the plan on the origin. Worth doing once per saved scan: a room
    /// captured 30 m from where ARKit started its session otherwise carries that
    /// offset into every drawing.
    func centered() -> FloorPlanData {
        let center = bounds.center
        return translated(dx: -center.x, dy: -center.y)
    }

    static func combining(_ plans: [FloorPlanData], spatiallyTrue: Bool) -> FloorPlanData {
        var combined = FloorPlanData()
        combined.isSpatiallyTrue = spatiallyTrue
        for plan in plans {
            combined.walls.append(contentsOf: plan.walls)
            combined.openings.append(contentsOf: plan.openings)
            combined.objects.append(contentsOf: plan.objects)
            combined.outlines.append(contentsOf: plan.outlines)
            combined.ceilingHeight = max(combined.ceilingHeight, plan.ceilingHeight)
        }
        return combined
    }
}
