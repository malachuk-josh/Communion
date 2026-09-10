import Foundation

enum RoomType: String, Codable, CaseIterable, Identifiable {
    case livingRoom, bedroom, kitchen, bathroom, diningRoom, office
    case hallway, entrance, garage, laundry, closet, basement, attic
    case stairwell, other

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .livingRoom: return "Living room"
        case .diningRoom: return "Dining room"
        case .bedroom: return "Bedroom"
        case .kitchen: return "Kitchen"
        case .bathroom: return "Bathroom"
        case .office: return "Office"
        case .hallway: return "Hallway"
        case .entrance: return "Entrance"
        case .garage: return "Garage"
        case .laundry: return "Laundry"
        case .closet: return "Closet"
        case .basement: return "Basement"
        case .attic: return "Attic"
        case .stairwell: return "Stairwell"
        case .other: return "Room"
        }
    }

    var symbolName: String {
        switch self {
        case .livingRoom: return "sofa"
        case .diningRoom: return "table.furniture"
        case .bedroom: return "bed.double"
        case .kitchen: return "cooktop"
        case .bathroom: return "shower"
        case .office: return "desktopcomputer"
        case .hallway, .entrance: return "door.left.hand.open"
        case .garage: return "car"
        case .laundry: return "washer"
        case .closet: return "cabinet"
        case .basement: return "stairs"
        case .attic: return "house"
        case .stairwell: return "figure.stairs"
        case .other: return "square.dashed"
        }
    }

    /// Maps RoomPlan's own section label (read as text, so an unfamiliar label
    /// from a future iOS release lands on `.other` rather than failing).
    init(roomPlanLabel: String?) {
        guard let label = roomPlanLabel?.lowercased() else { self = .other; return }
        switch true {
        case label.contains("living"): self = .livingRoom
        case label.contains("dining"): self = .diningRoom
        case label.contains("bedroom"): self = .bedroom
        case label.contains("kitchen"): self = .kitchen
        case label.contains("bath"): self = .bathroom
        case label.contains("office"): self = .office
        case label.contains("hall") || label.contains("corridor"): self = .hallway
        case label.contains("entrance") || label.contains("foyer"): self = .entrance
        case label.contains("garage"): self = .garage
        case label.contains("laundry"): self = .laundry
        case label.contains("closet") || label.contains("storage"): self = .closet
        case label.contains("basement"): self = .basement
        case label.contains("attic"): self = .attic
        case label.contains("stair"): self = .stairwell
        default: self = .other
        }
    }
}

/// One scanned room inside a walkthrough.
struct RoomRecord: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var type: RoomType = .other
    var notes: String = ""
    var capturedAt: Date = Date()
    /// The flattened plan, cached so lists and previews never decode a scan.
    var plan: FloorPlanData = .empty
    /// Whether the raw scan is still on disk. Without it, this room can be drawn
    /// and measured but cannot take part in a true multi-room merge.
    var hasRawCaptureData: Bool = false

    var floorArea: Double { plan.floorArea }
    var ceilingHeight: Double { plan.ceilingHeight }

    var doorCount: Int { plan.counts(of: .door) }
    var windowCount: Int { plan.counts(of: .window) }
}

/// One property walkthrough.
struct WalkProject: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var address: String = ""
    var client: String = ""
    var notes: String = ""
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var rooms: [RoomRecord] = []

    /// Total scanned floor area. Rooms are summed rather than taken from a
    /// merged outline, so the number does not move when a merge is recomputed.
    var totalFloorArea: Double {
        rooms.reduce(0) { $0 + $1.floorArea }
    }

    var canMergeIntoOnePlan: Bool {
        rooms.count > 1 && rooms.allSatisfy(\.hasRawCaptureData)
    }

    var subtitle: String {
        let roomLabel = rooms.count == 1 ? "1 room" : "\(rooms.count) rooms"
        return address.isEmpty ? roomLabel : "\(address) · \(roomLabel)"
    }

    /// Side-by-side arrangement of every room, used when a true merge is not
    /// available. Rooms are laid out on a grid in scan order, at true scale.
    func arrangedPlan() -> FloorPlanData {
        let plans = rooms.map { $0.plan.centered() }
        guard !plans.isEmpty else { return .empty }
        let gap = 1.5
        let columns = max(1, Int(Double(plans.count).squareRoot().rounded(.up)))
        let cellWidth = (plans.map { $0.bounds.width }.max() ?? 4) + gap
        let cellHeight = (plans.map { $0.bounds.height }.max() ?? 4) + gap

        var placed: [FloorPlanData] = []
        for (index, plan) in plans.enumerated() {
            let column = index % columns
            let row = index / columns
            placed.append(plan.translated(dx: Double(column) * cellWidth,
                                          dy: Double(row) * cellHeight))
        }
        return FloorPlanData.combining(placed, spatiallyTrue: false).centered()
    }
}
