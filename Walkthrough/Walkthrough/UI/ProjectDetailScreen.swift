import SwiftUI
import RoomPlan

struct ProjectDetailScreen: View {
    let projectID: UUID

    @EnvironmentObject private var store: ProjectStore
    @EnvironmentObject private var settings: AppSettings

    @State private var assembly: StructureAssembler.Assembly?
    @State private var isAssembling = false
    @State private var isScanning = false
    @State private var isEditingDetails = false
    @State private var shareItem: ShareItem?
    @State private var exportInProgress: String?
    @State private var exportError: String?

    private var project: WalkProject? { store.project(id: projectID) }

    var body: some View {
        Group {
            if let project {
                content(project)
            } else {
                ContentUnavailableView("Walkthrough not found", systemImage: "questionmark.folder")
            }
        }
        .navigationTitle(project?.name ?? "Walkthrough")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { isEditingDetails = true } label: {
                        Label("Edit details", systemImage: "pencil")
                    }
                    Divider()
                    exportMenuItems
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                }
            }
        }
        .fullScreenCover(isPresented: $isScanning, onDismiss: { Task { await rebuildPlan() } }) {
            CaptureScreen(projectID: projectID)
        }
        .sheet(isPresented: $isEditingDetails) {
            if let project {
                EditProjectSheet(project: project) { store.update($0) }
            }
        }
        .sheet(item: $shareItem) { item in
            ShareSheet(url: item.url)
        }
        .overlay { exportOverlay }
        .alert("Export failed",
               isPresented: Binding(get: { exportError != nil }, set: { if !$0 { exportError = nil } })) {
            Button("OK") { exportError = nil }
        } message: {
            Text(exportError ?? "")
        }
        .task(id: project?.rooms.count) { await rebuildPlan() }
    }

    // MARK: - Content

    private func content(_ project: WalkProject) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                planSection(project)
                summary(project)
                scanButton
                roomList(project)
                if !project.notes.isEmpty {
                    notes(project)
                }
            }
            .padding()
        }
    }

    private func planSection(_ project: WalkProject) -> some View {
        VStack(spacing: 8) {
            ZStack {
                if project.rooms.isEmpty {
                    ContentUnavailableView("No rooms scanned yet",
                                           systemImage: "viewfinder",
                                           description: Text("Scan the first room to start the plan."))
                        .frame(height: 260)
                } else {
                    FloorPlanView(plan: assembly?.plan ?? project.arrangedPlan(),
                                  style: .detail,
                                  unitSystem: settings.unitSystem,
                                  showFurniture: settings.showFurniture,
                                  showDimensions: settings.showDimensions)
                        .frame(height: 320)
                }
                if isAssembling {
                    ProgressView("Merging rooms…")
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))

            if let note = assembly?.note {
                Label(note, systemImage: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func summary(_ project: WalkProject) -> some View {
        HStack(spacing: 12) {
            MetricTile(title: "Total area",
                       value: Formatting.area(project.totalFloorArea, system: settings.unitSystem))
            MetricTile(title: "Rooms", value: "\(project.rooms.count)")
            MetricTile(title: "Doors / windows",
                       value: "\(totalDoors(project)) / \(totalWindows(project))")
        }
    }

    private var scanButton: some View {
        Button {
            isScanning = true
        } label: {
            Label(DeviceSupport.isSupported ? "Scan a room" : "Scanning unavailable",
                  systemImage: "camera.viewfinder")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .buttonStyle(.borderedProminent)
        .disabled(!DeviceSupport.isSupported)
    }

    private func roomList(_ project: WalkProject) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !project.rooms.isEmpty {
                Text("Rooms")
                    .font(.headline)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            ForEach(project.rooms) { room in
                NavigationLink {
                    RoomDetailScreen(projectID: projectID, roomID: room.id)
                } label: {
                    RoomRow(room: room, unitSystem: settings.unitSystem)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func notes(_ project: WalkProject) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Notes").font(.headline)
            Text(project.notes).font(.callout).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var exportOverlay: some View {
        Group {
            if let exportInProgress {
                ZStack {
                    Color.black.opacity(0.25).ignoresSafeArea()
                    ProgressView(exportInProgress)
                        .padding(20)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                }
            }
        }
    }

    // MARK: - Export

    @ViewBuilder
    private var exportMenuItems: some View {
        Button { Task { await exportPDF() } } label: {
            Label("Floor plan PDF", systemImage: "doc.richtext")
        }
        .disabled(project?.rooms.isEmpty ?? true)

        Button { Task { await exportUSDZ() } } label: {
            Label("3D model (USDZ)", systemImage: "cube.transparent")
        }
        .disabled(!(project.map { !$0.rooms.isEmpty } ?? false))

        Button { exportCSV() } label: {
            Label("Room schedule (CSV)", systemImage: "tablecells")
        }
        .disabled(project?.rooms.isEmpty ?? true)
    }

    @MainActor
    private func exportPDF() async {
        guard let project else { return }
        exportInProgress = "Building the PDF…"
        defer { exportInProgress = nil }

        if assembly == nil { await rebuildPlan() }
        let plan = assembly?.plan ?? project.arrangedPlan()
        let url = store.exportsDirectory(for: projectID)
            .appendingPathComponent(PlanExporter.filename(project.name, extension: "pdf"))
        do {
            try PlanExporter.writePDF(project: project,
                                      plan: plan,
                                      unitSystem: settings.unitSystem,
                                      showFurniture: settings.showFurniture,
                                      showDimensions: settings.showDimensions,
                                      to: url)
            shareItem = ShareItem(url: url)
        } catch {
            exportError = error.localizedDescription
        }
    }

    @MainActor
    private func exportUSDZ() async {
        guard let project, let firstRoom = project.rooms.first else { return }
        exportInProgress = "Building the 3D model…"
        defer { exportInProgress = nil }

        let url = store.exportsDirectory(for: projectID)
            .appendingPathComponent(PlanExporter.filename(project.name, extension: "usdz"))
        do {
            if assembly == nil { await rebuildPlan() }
            if let structure = assembly?.structure {
                try PlanExporter.writeUSDZ(structure: structure, to: url)
            } else if let room = store.capturedRoom(projectID: projectID, roomID: firstRoom.id) {
                // One room, or rooms that could not be merged: export what is
                // unambiguous rather than something stitched together wrongly.
                try PlanExporter.writeUSDZ(capturedRoom: room, to: url)
            } else {
                throw PlanExporter.ExportError.noScanData
            }
            shareItem = ShareItem(url: url)
        } catch {
            exportError = error.localizedDescription
        }
    }

    private func exportCSV() {
        guard let project else { return }
        let csv = PlanExporter.roomScheduleCSV(project: project, unitSystem: settings.unitSystem)
        let url = store.exportsDirectory(for: projectID)
            .appendingPathComponent(PlanExporter.filename(project.name + " rooms", extension: "csv"))
        do {
            try csv.write(to: url, atomically: true, encoding: .utf8)
            shareItem = ShareItem(url: url)
        } catch {
            exportError = error.localizedDescription
        }
    }

    // MARK: - Plan assembly

    private func rebuildPlan() async {
        guard let project, !project.rooms.isEmpty else {
            assembly = nil
            return
        }
        isAssembling = project.rooms.count > 1
        let result = await StructureAssembler.assemble(project: project, store: store)
        assembly = result
        isAssembling = false
    }

    private func totalDoors(_ project: WalkProject) -> Int {
        project.rooms.reduce(0) { $0 + $1.doorCount }
    }

    private func totalWindows(_ project: WalkProject) -> Int {
        project.rooms.reduce(0) { $0 + $1.windowCount }
    }
}

struct RoomRow: View {
    let room: RoomRecord
    let unitSystem: UnitSystem

    var body: some View {
        HStack(spacing: 14) {
            FloorPlanCanvas(plan: room.plan,
                            style: .preview,
                            unitSystem: unitSystem,
                            showFurniture: false,
                            showDimensions: false)
                .frame(width: 56, height: 56)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 3) {
                Text(room.name).font(.headline)
                HStack(spacing: 8) {
                    Label(room.type.displayName, systemImage: room.type.symbolName)
                    Text(Formatting.area(room.floorArea, system: unitSystem))
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct EditProjectSheet: View {
    @State var project: WalkProject
    var onSave: (WalkProject) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Property") {
                    TextField("Name", text: $project.name)
                    TextField("Address", text: $project.address)
                }
                Section("Client") {
                    TextField("Client or agent", text: $project.client)
                }
                Section("Notes") {
                    TextField("Notes", text: $project.notes, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle("Walkthrough details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(project)
                        dismiss()
                    }
                }
            }
        }
    }
}
