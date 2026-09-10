import Foundation
import RoomPlan

/// Combines the rooms of a walkthrough into a single floor plan.
///
/// When every room still has its raw scan, RoomPlan's own `StructureBuilder`
/// does the work and the result is a true plan: rooms sit where they really sit,
/// shared walls line up, doors connect. Otherwise the rooms are laid out side by
/// side and the result is clearly marked as an arrangement, not a survey.
enum StructureAssembler {
    struct Assembly {
        var plan: FloorPlanData
        var structure: CapturedStructure?
        var isSpatiallyTrue: Bool
        var note: String?
    }

    static func assemble(project: WalkProject, store: ProjectStore) async -> Assembly {
        guard !project.rooms.isEmpty else {
            return Assembly(plan: .empty, structure: nil, isSpatiallyTrue: true, note: nil)
        }
        if project.rooms.count == 1 {
            return Assembly(plan: project.rooms[0].plan,
                            structure: nil,
                            isSpatiallyTrue: true,
                            note: nil)
        }

        let rawScans = await MainActor.run {
            project.rooms.compactMap { store.rawCaptureData(projectID: project.id, roomID: $0.id) }
        }

        guard rawScans.count == project.rooms.count else {
            return Assembly(plan: project.arrangedPlan(),
                            structure: nil,
                            isSpatiallyTrue: false,
                            note: "Rooms are shown side by side. A true merged plan needs the full scan of every room — scan them in one continuous walkthrough to keep them in the same space.")
        }

        do {
            let builder = StructureBuilder(options: [.beautifyObjects])
            let structure = try await builder.capturedStructure(from: rawScans)
            let plan = structure.planData(roomNames: project.rooms.map(\.name))
            // A merge that loses the walls is worse than no merge at all.
            guard !plan.isEmpty else {
                return Assembly(plan: project.arrangedPlan(),
                                structure: structure,
                                isSpatiallyTrue: false,
                                note: "The rooms couldn't be merged into one plan, so they're shown side by side.")
            }
            return Assembly(plan: plan, structure: structure, isSpatiallyTrue: true, note: nil)
        } catch {
            return Assembly(plan: project.arrangedPlan(),
                            structure: nil,
                            isSpatiallyTrue: false,
                            note: "Merging the rooms failed (\(error.localizedDescription)). They're shown side by side instead.")
        }
    }
}
