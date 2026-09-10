import Foundation
import RoomPlan

/// File-backed storage for walkthroughs.
///
/// Layout under Application Support:
///
///     Walkthroughs/<projectID>/project.json
///     Walkthroughs/<projectID>/rooms/<roomID>.room.json   processed scan
///     Walkthroughs/<projectID>/rooms/<roomID>.raw.json    raw scan, for merging
///     Walkthroughs/<projectID>/exports/…                  generated files
///
/// A scan is large. Only `project.json` — which carries the flattened plan — is
/// held in memory; the scans themselves are read back on demand for export and
/// multi-room merging.
@MainActor
final class ProjectStore: ObservableObject {
    @Published private(set) var projects: [WalkProject] = []
    @Published var lastError: String?

    private let fileManager = FileManager.default
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private lazy var root: URL = {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Walkthroughs", isDirectory: true)
    }()

    init(loadImmediately: Bool = true) {
        if loadImmediately { load() }
    }

    // MARK: - Loading

    func load() {
        do {
            try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
            let entries = try fileManager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
            var loaded: [WalkProject] = []
            for entry in entries where entry.hasDirectoryPath {
                let manifest = entry.appendingPathComponent("project.json")
                guard let data = try? Data(contentsOf: manifest) else { continue }
                guard let project = try? decoder.decode(WalkProject.self, from: data) else {
                    // A manifest this version cannot read is left alone rather
                    // than deleted; the walkthrough may be someone's only copy.
                    continue
                }
                loaded.append(project)
            }
            projects = loaded.sorted { $0.updatedAt > $1.updatedAt }
        } catch {
            lastError = "Could not open your saved walkthroughs: \(error.localizedDescription)"
        }
    }

    // MARK: - Projects

    @discardableResult
    func createProject(name: String, address: String = "", client: String = "") -> WalkProject {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let project = WalkProject(name: trimmed.isEmpty ? "Untitled walkthrough" : trimmed,
                                  address: address.trimmingCharacters(in: .whitespacesAndNewlines),
                                  client: client.trimmingCharacters(in: .whitespacesAndNewlines))
        projects.insert(project, at: 0)
        save(project)
        return project
    }

    func project(id: UUID) -> WalkProject? {
        projects.first { $0.id == id }
    }

    func update(_ project: WalkProject) {
        var updated = project
        updated.updatedAt = Date()
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = updated
        } else {
            projects.insert(updated, at: 0)
        }
        projects.sort { $0.updatedAt > $1.updatedAt }
        save(updated)
    }

    func deleteProject(id: UUID) {
        projects.removeAll { $0.id == id }
        try? fileManager.removeItem(at: directory(for: id))
    }

    // MARK: - Rooms

    /// Saves a finished scan into a project and returns the room it became.
    @discardableResult
    func addRoom(to projectID: UUID,
                 capturedRoom: CapturedRoom,
                 rawData: CapturedRoomData?,
                 name: String,
                 type: RoomType) -> RoomRecord? {
        guard var project = project(id: projectID) else { return nil }

        var room = RoomRecord(name: name, type: type)
        room.plan = capturedRoom.planData(roomID: room.id, name: name).centered()

        let roomsDirectory = directory(for: projectID).appendingPathComponent("rooms", isDirectory: true)
        do {
            try fileManager.createDirectory(at: roomsDirectory, withIntermediateDirectories: true)
            let processed = try encoder.encode(capturedRoom)
            try processed.write(to: roomsDirectory.appendingPathComponent("\(room.id.uuidString).room.json"),
                                options: .atomic)
            if let rawData {
                let raw = try encoder.encode(rawData)
                try raw.write(to: roomsDirectory.appendingPathComponent("\(room.id.uuidString).raw.json"),
                              options: .atomic)
                room.hasRawCaptureData = true
            }
        } catch {
            // The plan itself is already in hand, so the room is still worth
            // keeping — it just cannot be exported as 3D or merged later.
            lastError = "Saved the plan, but not the full scan: \(error.localizedDescription)"
        }

        project.rooms.append(room)
        update(project)
        return room
    }

    func updateRoom(_ room: RoomRecord, in projectID: UUID) {
        guard var project = project(id: projectID),
              let index = project.rooms.firstIndex(where: { $0.id == room.id }) else { return }
        project.rooms[index] = room
        update(project)
    }

    func deleteRoom(id roomID: UUID, from projectID: UUID) {
        guard var project = project(id: projectID) else { return }
        project.rooms.removeAll { $0.id == roomID }
        update(project)
        let rooms = directory(for: projectID).appendingPathComponent("rooms", isDirectory: true)
        try? fileManager.removeItem(at: rooms.appendingPathComponent("\(roomID.uuidString).room.json"))
        try? fileManager.removeItem(at: rooms.appendingPathComponent("\(roomID.uuidString).raw.json"))
    }

    // MARK: - Scan data

    func capturedRoom(projectID: UUID, roomID: UUID) -> CapturedRoom? {
        let url = directory(for: projectID)
            .appendingPathComponent("rooms/\(roomID.uuidString).room.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(CapturedRoom.self, from: data)
    }

    func rawCaptureData(projectID: UUID, roomID: UUID) -> CapturedRoomData? {
        let url = directory(for: projectID)
            .appendingPathComponent("rooms/\(roomID.uuidString).raw.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(CapturedRoomData.self, from: data)
    }

    // MARK: - Paths

    func directory(for projectID: UUID) -> URL {
        root.appendingPathComponent(projectID.uuidString, isDirectory: true)
    }

    /// A scratch directory for generated files. Cleared each time so a stale
    /// export is never shared by mistake.
    func exportsDirectory(for projectID: UUID) -> URL {
        let url = directory(for: projectID).appendingPathComponent("exports", isDirectory: true)
        try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func save(_ project: WalkProject) {
        do {
            let directory = directory(for: project.id)
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try encoder.encode(project)
            try data.write(to: directory.appendingPathComponent("project.json"), options: .atomic)
        } catch {
            lastError = "Could not save this walkthrough: \(error.localizedDescription)"
        }
    }
}
