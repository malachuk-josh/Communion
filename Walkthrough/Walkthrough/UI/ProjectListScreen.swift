import SwiftUI

struct ProjectListScreen: View {
    @EnvironmentObject private var store: ProjectStore
    @EnvironmentObject private var settings: AppSettings

    @State private var isCreatingProject = false
    @State private var isShowingSettings = false
    @State private var newProjectID: UUID?
    @State private var path: [UUID] = []

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if store.projects.isEmpty {
                    emptyState
                } else {
                    list
                }
            }
            .navigationTitle("Walkthroughs")
            .navigationDestination(for: UUID.self) { projectID in
                ProjectDetailScreen(projectID: projectID)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isCreatingProject = true } label: {
                        Label("New walkthrough", systemImage: "plus")
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button { isShowingSettings = true } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $isCreatingProject) {
                NewProjectSheet { name, address, client in
                    let project = store.createProject(name: name, address: address, client: client)
                    path.append(project.id)
                }
            }
            .sheet(isPresented: $isShowingSettings) {
                SettingsSheet()
            }
            .alert("Something went wrong",
                   isPresented: Binding(get: { store.lastError != nil },
                                        set: { if !$0 { store.lastError = nil } })) {
                Button("OK") { store.lastError = nil }
            } message: {
                Text(store.lastError ?? "")
            }
        }
    }

    private var list: some View {
        List {
            ForEach(store.projects) { project in
                NavigationLink(value: project.id) {
                    ProjectRow(project: project, unitSystem: settings.unitSystem)
                }
            }
            .onDelete { offsets in
                for index in offsets {
                    store.deleteProject(id: store.projects[index].id)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No walkthroughs yet", systemImage: "house.badge.clock")
        } description: {
            Text("Start one, then scan each room as you walk the property. The floor plan builds itself as you go.")
        } actions: {
            Button("Start a walkthrough") { isCreatingProject = true }
                .buttonStyle(.borderedProminent)
        }
    }
}

struct ProjectRow: View {
    let project: WalkProject
    let unitSystem: UnitSystem

    var body: some View {
        HStack(spacing: 14) {
            FloorPlanCanvas(plan: thumbnailPlan,
                            style: .preview,
                            unitSystem: unitSystem,
                            showFurniture: false,
                            showDimensions: false)
                .frame(width: 64, height: 64)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 3) {
                Text(project.name).font(.headline)
                Text(project.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(Formatting.area(project.totalFloorArea, system: unitSystem))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }

    /// The card shows the rooms as they were scanned; a real merge is expensive
    /// and belongs on the detail screen, not in a list row.
    private var thumbnailPlan: FloorPlanData {
        project.rooms.count == 1 ? project.rooms[0].plan : project.arrangedPlan()
    }
}

struct NewProjectSheet: View {
    var onCreate: (String, String, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var address = ""
    @State private var client = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Property") {
                    TextField("Name (e.g. 14 Oak Street)", text: $name)
                    TextField("Address", text: $address)
                        .textContentType(.fullStreetAddress)
                }
                Section("Client") {
                    TextField("Client or agent (optional)", text: $client)
                        .textContentType(.name)
                }
            }
            .navigationTitle("New walkthrough")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        onCreate(name, address, client)
                        dismiss()
                    }
                }
            }
        }
    }
}

struct SettingsSheet: View {
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Units") {
                    Picker("Measurements", selection: $settings.unitSystem) {
                        ForEach(UnitSystem.allCases) { system in
                            Text(system.displayName).tag(system)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                Section("Plan drawing") {
                    Toggle("Show furniture", isOn: $settings.showFurniture)
                    Toggle("Show wall dimensions", isOn: $settings.showDimensions)
                }
                Section {
                    LabeledContent("Scanning", value: DeviceSupport.isSupported ? "Supported" : "Not available")
                } footer: {
                    Text(DeviceSupport.isSupported
                         ? "Room scanning uses the LiDAR camera and works best in a well-lit room."
                         : DeviceSupport.unsupportedMessage)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
