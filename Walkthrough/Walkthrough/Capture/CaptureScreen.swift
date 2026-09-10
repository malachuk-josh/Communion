import SwiftUI
import RoomPlan

struct RoomCaptureViewContainer: UIViewRepresentable {
    let captureView: RoomCaptureView

    func makeUIView(context: Context) -> RoomCaptureView { captureView }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}

/// The scanning flow: point, walk the room, finish, name it, scan the next one.
struct CaptureScreen: View {
    let projectID: UUID

    @EnvironmentObject private var store: ProjectStore
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss

    @StateObject private var controller = CaptureController()
    @State private var roomName = ""
    @State private var roomType: RoomType = .other
    @State private var savedRoomNames: [String] = []

    var body: some View {
        ZStack {
            RoomCaptureViewContainer(captureView: controller.captureView)
                .ignoresSafeArea()

            VStack {
                topBar
                Spacer()
                if case .review = controller.phase {
                    EmptyView()
                } else {
                    bottomBar
                }
            }
            .padding()

            if case .processing = controller.phase {
                processingOverlay
            }
            if case .failed(let message) = controller.phase {
                failureOverlay(message)
            }
        }
        .statusBarHidden()
        .onAppear { controller.startScanning() }
        .onDisappear { controller.endSession() }
        .sheet(isPresented: reviewBinding) {
            if let result = controller.result {
                ScanReviewSheet(result: result,
                                roomName: $roomName,
                                roomType: $roomType,
                                unitSystem: settings.unitSystem,
                                onSave: { scanAnother in save(result, scanAnother: scanAnother) },
                                onDiscard: {
                                    controller.discardResult()
                                    controller.startScanning()
                                })
                .interactiveDismissDisabled()
            }
        }
        // Keyed on the phase rather than on the suggestion itself: two rooms in
        // a row can suggest the same type, and that still needs a fresh name.
        .onChange(of: controller.phase) { _, phase in
            guard phase == .review, let suggested = controller.result?.suggestedType else { return }
            roomType = suggested
            if roomName.trimmingCharacters(in: .whitespaces).isEmpty {
                roomName = defaultName(for: suggested)
            }
        }
    }

    private var reviewBinding: Binding<Bool> {
        Binding(get: { controller.phase == .review && controller.result != nil },
                set: { _ in })
    }

    // MARK: - Chrome

    private var topBar: some View {
        HStack(alignment: .top) {
            Button {
                controller.endSession()
                dismiss()
            } label: {
                Label("Done", systemImage: "xmark.circle.fill")
                    .labelStyle(.iconOnly)
                    .font(.title)
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(.white)
            }
            .accessibilityLabel("Finish walkthrough")

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if !savedRoomNames.isEmpty {
                    Text("\(savedRoomNames.count) scanned")
                        .font(.caption.weight(.semibold))
                }
                if controller.liveArea > 1 {
                    Text(Formatting.area(controller.liveArea, system: settings.unitSystem))
                        .font(.title3.weight(.semibold).monospacedDigit())
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 16) {
            Text(controller.instruction)
                .font(.callout.weight(.medium))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.black.opacity(0.5), in: Capsule())

            Button(action: controller.finishRoom) {
                Text("Finish room")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!controller.isScanning)
        }
    }

    private var processingOverlay: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView().controlSize(.large).tint(.white)
                Text("Building the room…").foregroundStyle(.white)
            }
        }
    }

    private func failureOverlay(_ message: String) -> some View {
        ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.yellow)
                Text("The scan stopped").font(.headline).foregroundStyle(.white)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
                HStack {
                    Button("Try again") { controller.startScanning() }
                        .buttonStyle(.borderedProminent)
                    Button("Close") { dismiss() }
                        .buttonStyle(.bordered)
                }
            }
            .padding(32)
        }
    }

    // MARK: - Saving

    private func save(_ result: CaptureController.ScanResult, scanAnother: Bool) {
        let name = roomName.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalName = name.isEmpty ? defaultName(for: roomType) : name
        store.addRoom(to: projectID,
                      capturedRoom: result.capturedRoom,
                      rawData: result.rawData,
                      name: finalName,
                      type: roomType)
        savedRoomNames.append(finalName)
        roomName = ""
        controller.acceptResult()

        if scanAnother {
            controller.startScanning()
        } else {
            controller.endSession()
            dismiss()
        }
    }

    /// "Bedroom", then "Bedroom 2" — the numbering a walkthrough actually needs.
    /// Counts what is already saved in the project; rooms saved during this
    /// session are in there too, so they are not counted twice.
    private func defaultName(for type: RoomType) -> String {
        let base = type.displayName
        let existing = store.project(id: projectID)?.rooms.map(\.name) ?? []
        let matches = existing.filter { $0 == base || $0.hasPrefix("\(base) ") }.count
        return matches == 0 ? base : "\(base) \(matches + 1)"
    }
}

/// Shown the moment a room finishes processing, while the scanner is still in
/// the room: name it, check the area, then move on.
struct ScanReviewSheet: View {
    let result: CaptureController.ScanResult
    @Binding var roomName: String
    @Binding var roomType: RoomType
    let unitSystem: UnitSystem
    let onSave: (Bool) -> Void
    let onDiscard: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    FloorPlanCanvas(plan: result.plan,
                                    style: .preview,
                                    unitSystem: unitSystem,
                                    showFurniture: true,
                                    showDimensions: true)
                        .frame(height: 240)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))

                    HStack(spacing: 12) {
                        MetricTile(title: "Floor area",
                                   value: Formatting.area(result.plan.floorArea, system: unitSystem))
                        MetricTile(title: "Ceiling",
                                   value: Formatting.length(result.plan.ceilingHeight, system: unitSystem))
                        MetricTile(title: "Openings",
                                   value: "\(result.plan.counts(of: .door)) / \(result.plan.counts(of: .window))",
                                   caption: "doors / windows")
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        TextField("Room name", text: $roomName)
                            .textFieldStyle(.roundedBorder)
                            .font(.headline)

                        Picker("Room type", selection: $roomType) {
                            ForEach(RoomType.allCases) { type in
                                Label(type.displayName, systemImage: type.symbolName).tag(type)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    if result.rawData == nil {
                        Label("This room can't be merged with the others later — its raw scan wasn't kept.",
                              systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
            }
            .navigationTitle("Room scanned")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Discard", role: .destructive, action: onDiscard)
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    Button { onSave(true) } label: {
                        Label("Save & scan next room", systemImage: "plus.viewfinder")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Save & finish walkthrough") { onSave(false) }
                        .frame(maxWidth: .infinity)
                }
                .padding()
                .background(.bar)
            }
        }
    }
}

struct MetricTile: View {
    let title: String
    let value: String
    var caption: String?

    var body: some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline.monospacedDigit())
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            if let caption {
                Text(caption).font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
