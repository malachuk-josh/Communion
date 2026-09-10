import Foundation
import RoomPlan
import Combine

/// Owns one RoomPlan capture session and turns its callbacks into state a
/// SwiftUI screen can render.
///
/// A walkthrough scans several rooms in a row. The session is stopped between
/// rooms *without* pausing the underlying AR session, so every room stays in the
/// same world coordinate space and the rooms can later be merged into one true
/// floor plan.
final class CaptureController: NSObject, ObservableObject {
    enum Phase: Equatable {
        case ready
        case scanning
        case processing
        case review
        case failed(String)
    }

    struct ScanResult {
        var capturedRoom: CapturedRoom
        var rawData: CapturedRoomData?
        var plan: FloorPlanData
        var suggestedType: RoomType
    }

    @Published private(set) var phase: Phase = .ready
    @Published private(set) var instruction: String = "Point the camera at a wall to begin."
    @Published private(set) var liveArea: Double = 0
    @Published private(set) var liveWallCount: Int = 0
    @Published private(set) var roomsCapturedInSession: Int = 0
    @Published var result: ScanResult?

    let captureView: RoomCaptureView

    private var pendingRawData: CapturedRoomData?
    private var lastLiveUpdate = Date.distantPast
    private var hasRunOnce = false

    /// Must be created on the main thread, and only on a device that supports
    /// room capture — check `DeviceSupport.isSupported` first.
    override init() {
        captureView = RoomCaptureView(frame: .zero)
        super.init()
        captureView.delegate = self
        captureView.captureSession.delegate = self
    }

    var isScanning: Bool { phase == .scanning }

    // MARK: - Session control

    func startScanning() {
        pendingRawData = nil
        result = nil
        liveArea = 0
        liveWallCount = 0
        phase = .scanning
        instruction = hasRunOnce
            ? "Walk into the next room and scan its walls."
            : "Point the camera at a wall to begin."
        hasRunOnce = true

        var configuration = RoomCaptureSession.Configuration()
        configuration.isCoachingEnabled = true
        captureView.captureSession.run(configuration: configuration)
    }

    /// Ends the current room. The AR session keeps running so the next room
    /// lands in the same coordinate space as this one.
    func finishRoom() {
        guard phase == .scanning else { return }
        phase = .processing
        instruction = "Finishing up…"
        captureView.captureSession.stop(pauseARSession: false)
    }

    /// Ends the whole walkthrough and releases the camera.
    func endSession() {
        if phase == .scanning {
            captureView.captureSession.stop(pauseARSession: true)
        }
        phase = .ready
    }

    func acceptResult() {
        roomsCapturedInSession += 1
        result = nil
        phase = .ready
    }

    func discardResult() {
        result = nil
        phase = .ready
    }

    // MARK: - Main-thread helpers

    private func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }
}

// MARK: - RoomCaptureViewDelegate

extension CaptureController: RoomCaptureViewDelegate {
    /// Returning true lets the view show its own processed 3D result while the
    /// app builds the 2D plan behind it.
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        pendingRawData = roomDataForProcessing
        if let error {
            onMain { [weak self] in self?.phase = .failed(error.localizedDescription) }
            return false
        }
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        onMain { [weak self] in
            guard let self else { return }
            if let error {
                self.phase = .failed(error.localizedDescription)
                return
            }
            let plan = processedResult.planData().centered()
            self.result = ScanResult(capturedRoom: processedResult,
                                     rawData: self.pendingRawData,
                                     plan: plan,
                                     suggestedType: RoomType(roomPlanLabel: processedResult.suggestedRoomTypeName))
            self.phase = .review
        }
    }
}

// MARK: - RoomCaptureSessionDelegate

extension CaptureController: RoomCaptureSessionDelegate {
    func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {
        let text: String
        switch instruction {
        case .moveCloseToWall: text = "Move closer to the wall."
        case .moveAwayFromWall: text = "Back up a little."
        case .slowDown: text = "Slow down."
        case .turnOnLight: text = "Too dark — turn on a light."
        case .lowTexture: text = "This surface is hard to read. Try another angle."
        case .normal: text = "Looking good. Keep walking the walls."
        default: text = "Keep scanning."
        }
        onMain { [weak self] in self?.instruction = text }
    }

    /// Live geometry, throttled: the plan is rebuilt a couple of times a second
    /// so the on-screen area readout keeps up without fighting the scanner.
    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        guard Date().timeIntervalSince(lastLiveUpdate) > 0.5 else { return }
        lastLiveUpdate = Date()
        let plan = room.planData()
        let area = plan.floorArea
        let walls = plan.walls.count
        onMain { [weak self] in
            self?.liveArea = area
            self?.liveWallCount = walls
        }
    }

    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        pendingRawData = data
        if let error {
            onMain { [weak self] in self?.phase = .failed(error.localizedDescription) }
        }
    }
}
