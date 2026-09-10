import Foundation
import RoomPlan
import simd

/// The only file that knows both RoomPlan and the plan model. Everything the
/// app draws, measures, prints or shares goes through here first.
///
/// RoomPlan hands back 3D surfaces: each one a transform, a size, and a
/// category. A floor plan is that geometry flattened onto the x/z ground plane.

extension CapturedRoom {
    /// Flattens a scanned room into a drawable plan.
    /// - Parameter roomID: the app's own identifier for this room, stamped onto
    ///   every element so a merged plan can still be split back apart.
    func planData(roomID: UUID? = nil, name: String? = nil) -> FloorPlanData {
        RoomPlanFlattener.flatten(walls: walls,
                                  doors: doors,
                                  windows: windows,
                                  openings: openings,
                                  objects: objects,
                                  floors: floors,
                                  roomID: roomID,
                                  name: name ?? "Room")
    }

    /// RoomPlan's own guess at what kind of room this is, if it made one.
    var suggestedRoomTypeName: String? {
        sections.first.map { String(describing: $0.label) }
    }
}

extension CapturedStructure {
    /// Flattens a merged multi-room structure, keeping one outline per room so
    /// each space can still be labelled and measured on the whole-floor plan.
    func planData(roomNames: [String] = []) -> FloorPlanData {
        var plans: [FloorPlanData] = []
        for (index, room) in rooms.enumerated() {
            let name = index < roomNames.count ? roomNames[index] : "Room \(index + 1)"
            plans.append(room.planData(roomID: UUID(), name: name))
        }
        if plans.isEmpty {
            // A structure with no per-room breakdown still has surfaces of its own.
            plans = [RoomPlanFlattener.flatten(walls: walls,
                                               doors: doors,
                                               windows: windows,
                                               openings: openings,
                                               objects: objects,
                                               floors: floors,
                                               roomID: nil,
                                               name: "Floor")]
        }
        return FloorPlanData.combining(plans, spatiallyTrue: true).centered()
    }
}

enum RoomPlanFlattener {
    static func flatten(walls: [CapturedRoom.Surface],
                        doors: [CapturedRoom.Surface],
                        windows: [CapturedRoom.Surface],
                        openings: [CapturedRoom.Surface],
                        objects: [CapturedRoom.Object],
                        floors: [CapturedRoom.Surface],
                        roomID: UUID?,
                        name: String) -> FloorPlanData {
        var plan = FloorPlanData()
        plan.walls = walls.map { surface in
            let segment = groundSegment(of: surface)
            return PlanWall(start: segment.0,
                            end: segment.1,
                            thickness: max(0.05, Double(surface.dimensions.z)),
                            height: Double(surface.dimensions.y),
                            roomID: roomID)
        }

        let floorLevel = floorHeight(walls: walls, floors: floors)

        func opening(_ surface: CapturedRoom.Surface, kind: OpeningKind) -> PlanOpening {
            let segment = groundSegment(of: surface)
            let height = Double(surface.dimensions.y)
            let centerY = Double(surface.transform.columns.3.y)
            return PlanOpening(kind: kind,
                               start: segment.0,
                               end: segment.1,
                               height: height,
                               sillHeight: max(0, centerY - (height / 2) - floorLevel),
                               roomID: roomID)
        }

        plan.openings = doors.map { opening($0, kind: isOpen($0) ? .openDoor : .door) }
            + windows.map { opening($0, kind: .window) }
            + openings.map { opening($0, kind: .opening) }

        plan.objects = objects.map { object in
            let transform = object.transform
            let xAxis = axis(transform, column: 0)
            let center = PlanPoint(x: Double(transform.columns.3.x), y: Double(transform.columns.3.z))
            return PlanObject(category: PlanObjectCategory(roomPlanDescription: String(describing: object.category)),
                              center: center,
                              size: PlanPoint(x: Double(object.dimensions.x), y: Double(object.dimensions.z)),
                              rotation: PlanGeometry.squared(angle: atan2(Double(xAxis.z), Double(xAxis.x))),
                              heightAboveFloor: Double(object.dimensions.y),
                              roomID: roomID)
        }

        let polygon = footprint(walls: plan.walls, floors: floors)
        if polygon.count >= 3 {
            plan.outlines = [PlanRoomOutline(roomID: roomID, name: name, polygon: polygon)]
        }

        plan.ceilingHeight = ceilingHeight(walls: walls)
        return plan
    }

    // MARK: - Surfaces

    /// A wall's footprint is its centre line: the surface centre, extended by
    /// half its width along the surface's own x axis, read on the ground plane.
    private static func groundSegment(of surface: CapturedRoom.Surface) -> (PlanPoint, PlanPoint) {
        let transform = surface.transform
        let center = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        let direction = axis(transform, column: 0)
        let half = surface.dimensions.x / 2
        let a = center - (direction * half)
        let b = center + (direction * half)
        return (PlanPoint(x: Double(a.x), y: Double(a.z)),
                PlanPoint(x: Double(b.x), y: Double(b.z)))
    }

    private static func axis(_ transform: simd_float4x4, column: Int) -> SIMD3<Float> {
        let raw = SIMD3<Float>(transform.columns[column].x,
                               transform.columns[column].y,
                               transform.columns[column].z)
        let length = simd_length(raw)
        return length > 1e-6 ? raw / length : SIMD3<Float>(1, 0, 0)
    }

    private static func isOpen(_ surface: CapturedRoom.Surface) -> Bool {
        // Category is `.door(isOpen:)`; reading it as text avoids pinning this
        // file to one release's spelling of the associated value.
        String(describing: surface.category).contains("true")
    }

    // MARK: - Heights

    /// World y of the floor, taken from the bottom of the walls. RoomPlan's
    /// origin is where the session started, not the ground.
    private static func floorHeight(walls: [CapturedRoom.Surface], floors: [CapturedRoom.Surface]) -> Double {
        if let floor = floors.first {
            return Double(floor.transform.columns.3.y)
        }
        let bottoms = walls.map { Double($0.transform.columns.3.y) - (Double($0.dimensions.y) / 2) }
        return bottoms.min() ?? 0
    }

    private static func ceilingHeight(walls: [CapturedRoom.Surface]) -> Double {
        let heights = walls.map { Double($0.dimensions.y) }.sorted()
        guard !heights.isEmpty else { return 0 }
        return heights[heights.count / 2]
    }

    // MARK: - Footprint

    /// The room's floor outline. RoomPlan gives a floor polygon for most scans;
    /// where it doesn't — or where the polygon lands somewhere the walls plainly
    /// are not — the walls' own footprint is used instead.
    private static func footprint(walls: [PlanWall], floors: [CapturedRoom.Surface]) -> [PlanPoint] {
        let wallHull = PlanGeometry.convexHull(of: walls.flatMap { [$0.start, $0.end] })
        let wallCentroid = PlanGeometry.centroid(of: wallHull)
        let wallArea = PlanGeometry.area(of: wallHull)

        var best: [PlanPoint] = wallHull
        var bestScore = Double.infinity

        for floor in floors {
            for candidate in polygonCandidates(for: floor) where candidate.count >= 3 {
                let area = PlanGeometry.area(of: candidate)
                guard area > 0.5 else { continue }
                // Score on how far the candidate sits from the walls and how far
                // its area strays from theirs. Both are unitless enough to add.
                let offset = PlanGeometry.centroid(of: candidate).distance(to: wallCentroid)
                let areaRatio = wallArea > 0.5 ? abs(area - wallArea) / wallArea : 0
                let score = offset + areaRatio
                if score < bestScore {
                    bestScore = score
                    best = candidate
                }
            }
        }

        // A floor polygon that lands more than a couple of metres off the walls
        // is not this room's floor; keep the walls.
        return bestScore < 2.0 ? best : wallHull
    }

    /// RoomPlan's polygon corners are documented as local to the surface, but
    /// treating them as world coordinates is a one-line difference and a scan
    /// that silently draws in the wrong place. Both readings are offered and the
    /// caller keeps whichever lands on the walls.
    private static func polygonCandidates(for floor: CapturedRoom.Surface) -> [[PlanPoint]] {
        let corners = floor.polygonCorners
        guard !corners.isEmpty else { return [] }

        let asWorld = corners.map { PlanPoint(x: Double($0.x), y: Double($0.z)) }
        let transform = floor.transform
        let asLocal = corners.map { corner -> PlanPoint in
            let world = transform * SIMD4<Float>(corner.x, corner.y, corner.z, 1)
            return PlanPoint(x: Double(world.x), y: Double(world.z))
        }
        return [asLocal, asWorld]
    }
}
