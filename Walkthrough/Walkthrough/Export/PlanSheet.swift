import SwiftUI

/// Page one of the exported PDF: title block and the plan itself.
/// Deliberately drawn in fixed colours — a PDF has no dark mode.
struct PlanSheet: View {
    let project: WalkProject
    let plan: FloorPlanData
    let unitSystem: UnitSystem
    var showFurniture: Bool = true
    var showDimensions: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().overlay(Color.black.opacity(0.3))
            FloorPlanCanvas(plan: plan,
                            style: .print,
                            unitSystem: unitSystem,
                            showFurniture: showFurniture,
                            showDimensions: showDimensions)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            footer
        }
        .background(Color.white)
        .foregroundStyle(Color.black)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(project.name)
                    .font(.system(size: 20, weight: .bold))
                if !project.address.isEmpty {
                    Text(project.address).font(.system(size: 12))
                }
                if !project.client.isEmpty {
                    Text("Prepared for \(project.client)")
                        .font(.system(size: 11))
                        .foregroundStyle(Color(white: 0.35))
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(Formatting.area(project.totalFloorArea, system: unitSystem))
                    .font(.system(size: 20, weight: .bold).monospacedDigit())
                Text(project.rooms.count == 1 ? "1 room" : "\(project.rooms.count) rooms")
                    .font(.system(size: 11))
                    .foregroundStyle(Color(white: 0.35))
                Text(Formatting.date.string(from: project.updatedAt))
                    .font(.system(size: 10))
                    .foregroundStyle(Color(white: 0.45))
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 16)
    }

    private var footer: some View {
        HStack {
            if !plan.isSpatiallyTrue {
                Text("Rooms arranged side by side — relative positions are not surveyed.")
                    .font(.system(size: 9))
                    .foregroundStyle(Color(white: 0.35))
            }
            Spacer()
            Text("Measured with the LiDAR scanner. Dimensions are approximate.")
                .font(.system(size: 9))
                .foregroundStyle(Color(white: 0.45))
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 14)
    }
}

/// Page two: the room schedule, which is the part a contractor or agent
/// actually reads numbers off.
struct RoomSchedule: View {
    let project: WalkProject
    let unitSystem: UnitSystem

    private var lengthUnit: String { unitSystem == .metric ? "m" : "ft" }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Room schedule")
                .font(.system(size: 18, weight: .bold))
                .padding(.horizontal, 28)
                .padding(.top, 20)
                .padding(.bottom, 12)

            row(cells: ["Room", "Type", "Floor area", "Perimeter", "Ceiling", "Doors", "Windows"],
                weight: .semibold)
            Divider().overlay(Color.black.opacity(0.4))

            ForEach(project.rooms) { room in
                row(cells: [
                    room.name,
                    room.type.displayName,
                    Formatting.area(room.floorArea, system: unitSystem),
                    Formatting.length(room.plan.wallPerimeter, system: unitSystem),
                    Formatting.length(room.ceilingHeight, system: unitSystem),
                    "\(room.doorCount)",
                    "\(room.windowCount)"
                ], weight: .regular)
                Divider().overlay(Color.black.opacity(0.12))
            }

            row(cells: ["Total", "",
                        Formatting.area(project.totalFloorArea, system: unitSystem),
                        "", "", "", ""],
                weight: .semibold)

            if !project.notes.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Notes").font(.system(size: 12, weight: .semibold))
                    Text(project.notes).font(.system(size: 11))
                }
                .padding(.horizontal, 28)
                .padding(.top, 20)
            }

            Spacer()
        }
        .background(Color.white)
        .foregroundStyle(Color.black)
    }

    private func row(cells: [String], weight: Font.Weight) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(cells.enumerated()), id: \.offset) { index, cell in
                Text(cell)
                    .font(.system(size: 11, weight: weight).monospacedDigit())
                    .frame(maxWidth: .infinity, alignment: index == 0 ? .leading : .trailing)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 7)
    }
}
