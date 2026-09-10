import SwiftUI

struct RoomDetailScreen: View {
    let projectID: UUID
    let roomID: UUID

    @EnvironmentObject private var store: ProjectStore
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss

    @State private var draft: RoomRecord?
    @State private var shareItem: ShareItem?
    @State private var exportError: String?
    @State private var isConfirmingDelete = false

    private var room: RoomRecord? {
        store.project(id: projectID)?.rooms.first { $0.id == roomID }
    }

    var body: some View {
        Group {
            if let room = draft ?? room {
                content(room)
            } else {
                ContentUnavailableView("Room not found", systemImage: "questionmark.square.dashed")
            }
        }
        .navigationTitle(draft?.name ?? room?.name ?? "Room")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { exportUSDZ() } label: {
                        Label("3D model (USDZ)", systemImage: "cube.transparent")
                    }
                    Button { exportPDF() } label: {
                        Label("Room plan PDF", systemImage: "doc.richtext")
                    }
                    Divider()
                    Button(role: .destructive) { isConfirmingDelete = true } label: {
                        Label("Delete room", systemImage: "trash")
                    }
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                }
            }
        }
        .sheet(item: $shareItem) { ShareSheet(url: $0.url) }
        .alert("Export failed",
               isPresented: Binding(get: { exportError != nil }, set: { if !$0 { exportError = nil } })) {
            Button("OK") { exportError = nil }
        } message: {
            Text(exportError ?? "")
        }
        .confirmationDialog("Delete this room?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                store.deleteRoom(id: roomID, from: projectID)
                dismiss()
            }
        } message: {
            Text("The scan and its measurements will be removed from this walkthrough.")
        }
        .onAppear { if draft == nil { draft = room } }
        .onDisappear { commit() }
    }

    private func content(_ room: RoomRecord) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                FloorPlanView(plan: room.plan,
                              style: .detail,
                              unitSystem: settings.unitSystem,
                              showFurniture: settings.showFurniture,
                              showDimensions: settings.showDimensions)
                    .frame(height: 320)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))

                HStack(spacing: 12) {
                    MetricTile(title: "Floor area",
                               value: Formatting.area(room.floorArea, system: settings.unitSystem))
                    MetricTile(title: "Perimeter",
                               value: Formatting.length(room.plan.wallPerimeter, system: settings.unitSystem))
                    MetricTile(title: "Ceiling",
                               value: Formatting.length(room.ceilingHeight, system: settings.unitSystem))
                }

                details
                wallList(room)
                objectList(room)

                Text("Scanned \(Formatting.date.string(from: room.capturedAt))")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
        }
    }

    @ViewBuilder
    private var details: some View {
        if let binding = draftBinding {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Room name", text: binding.name)
                    .textFieldStyle(.roundedBorder)
                Picker("Room type", selection: binding.type) {
                    ForEach(RoomType.allCases) { type in
                        Label(type.displayName, systemImage: type.symbolName).tag(type)
                    }
                }
                TextField("Notes", text: binding.notes, axis: .vertical)
                    .lineLimit(2...6)
                    .textFieldStyle(.roundedBorder)
            }
        }
    }

    private func wallList(_ room: RoomRecord) -> some View {
        DisclosureGroup {
            VStack(spacing: 0) {
                ForEach(room.plan.walls.sorted { $0.length > $1.length }) { wall in
                    HStack {
                        Text("Wall")
                        Spacer()
                        Text(Formatting.length(wall.length, system: settings.unitSystem))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    .font(.subheadline)
                    .padding(.vertical, 6)
                    Divider()
                }
            }
        } label: {
            Label("\(room.plan.walls.count) walls · \(room.doorCount) doors · \(room.windowCount) windows",
                  systemImage: "square.split.bottomrightquarter")
                .font(.subheadline.weight(.medium))
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func objectList(_ room: RoomRecord) -> some View {
        if !room.plan.objects.isEmpty {
            DisclosureGroup {
                VStack(spacing: 0) {
                    ForEach(groupedObjects(room), id: \.0) { category, count in
                        HStack {
                            Label(category.displayName, systemImage: category.symbolName)
                            Spacer()
                            Text("\(count)").monospacedDigit().foregroundStyle(.secondary)
                        }
                        .font(.subheadline)
                        .padding(.vertical, 6)
                        Divider()
                    }
                }
            } label: {
                Label("\(room.plan.objects.count) items detected", systemImage: "shippingbox")
                    .font(.subheadline.weight(.medium))
            }
            .padding(12)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func groupedObjects(_ room: RoomRecord) -> [(PlanObjectCategory, Int)] {
        Dictionary(grouping: room.plan.objects, by: \.category)
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 == $1.1 ? $0.0.rawValue < $1.0.rawValue : $0.1 > $1.1 }
    }

    private var draftBinding: Binding<RoomRecord>? {
        guard draft != nil else { return nil }
        return Binding(get: { draft ?? RoomRecord(name: "") },
                       set: { draft = $0 })
    }

    /// Edits are written back when the screen goes away, so typing a name does
    /// not rewrite the project file on every keystroke.
    private func commit() {
        guard let draft, draft != room else { return }
        store.updateRoom(draft, in: projectID)
    }

    // MARK: - Export

    private func exportUSDZ() {
        guard let room = draft ?? room else { return }
        guard let captured = store.capturedRoom(projectID: projectID, roomID: roomID) else {
            exportError = PlanExporter.ExportError.noScanData.localizedDescription
            return
        }
        let url = store.exportsDirectory(for: projectID)
            .appendingPathComponent(PlanExporter.filename(room.name, extension: "usdz"))
        do {
            try PlanExporter.writeUSDZ(capturedRoom: captured, to: url)
            shareItem = ShareItem(url: url)
        } catch {
            exportError = error.localizedDescription
        }
    }

    private func exportPDF() {
        guard let room = draft ?? room, let project = store.project(id: projectID) else { return }
        var single = project
        single.name = "\(project.name) — \(room.name)"
        single.rooms = [room]
        let url = store.exportsDirectory(for: projectID)
            .appendingPathComponent(PlanExporter.filename(room.name, extension: "pdf"))
        do {
            try PlanExporter.writePDF(project: single,
                                      plan: room.plan,
                                      unitSystem: settings.unitSystem,
                                      showFurniture: settings.showFurniture,
                                      showDimensions: settings.showDimensions,
                                      to: url)
            shareItem = ShareItem(url: url)
        } catch {
            exportError = error.localizedDescription
        }
    }
}
