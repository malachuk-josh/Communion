import Foundation
import SwiftUI

enum UnitSystem: String, Codable, CaseIterable, Identifiable {
    case imperial
    case metric

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .imperial: return "Feet & inches"
        case .metric: return "Metres"
        }
    }
}

/// Everything the app shows is measured in metres and formatted at the last
/// moment, so switching units never rewrites stored geometry.
enum Formatting {
    static let feetPerMetre = 3.280839895013123
    static let squareFeetPerSquareMetre = 10.763910416709722

    /// e.g. `12' 4"` or `3.76 m`
    static func length(_ metres: Double, system: UnitSystem) -> String {
        guard metres.isFinite else { return "—" }
        switch system {
        case .metric:
            return String(format: "%.2f m", metres)
        case .imperial:
            let totalInches = (metres * feetPerMetre * 12).rounded()
            let feet = Int(totalInches / 12)
            let inches = Int(totalInches) % 12
            return inches == 0 ? "\(feet)'" : "\(feet)' \(inches)\""
        }
    }

    /// Short form for drawing onto a plan, where space is tight.
    static func compactLength(_ metres: Double, system: UnitSystem) -> String {
        switch system {
        case .metric:
            return String(format: "%.2f", metres)
        case .imperial:
            return length(metres, system: system)
        }
    }

    /// e.g. `184 sq ft` or `17.1 m²`
    static func area(_ squareMetres: Double, system: UnitSystem) -> String {
        guard squareMetres.isFinite, squareMetres > 0 else { return "—" }
        switch system {
        case .metric:
            return String(format: "%.1f m²", squareMetres)
        case .imperial:
            return "\(Int((squareMetres * squareFeetPerSquareMetre).rounded())) sq ft"
        }
    }

    static func areaValue(_ squareMetres: Double, system: UnitSystem) -> Double {
        system == .metric ? squareMetres : squareMetres * squareFeetPerSquareMetre
    }

    static let date: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}

/// App-wide preferences. Small enough to live in `UserDefaults`.
@MainActor
final class AppSettings: ObservableObject {
    @Published var unitSystem: UnitSystem {
        didSet { UserDefaults.standard.set(unitSystem.rawValue, forKey: Keys.unitSystem) }
    }

    @Published var showFurniture: Bool {
        didSet { UserDefaults.standard.set(showFurniture, forKey: Keys.showFurniture) }
    }

    @Published var showDimensions: Bool {
        didSet { UserDefaults.standard.set(showDimensions, forKey: Keys.showDimensions) }
    }

    private enum Keys {
        static let unitSystem = "settings.unitSystem"
        static let showFurniture = "settings.showFurniture"
        static let showDimensions = "settings.showDimensions"
    }

    init() {
        let defaults = UserDefaults.standard
        let stored = defaults.string(forKey: Keys.unitSystem).flatMap(UnitSystem.init(rawValue:))
        // Imperial by default: a US property walkthrough is quoted in feet.
        unitSystem = stored ?? (Locale.current.measurementSystem == .metric ? .metric : .imperial)
        showFurniture = defaults.object(forKey: Keys.showFurniture) as? Bool ?? true
        showDimensions = defaults.object(forKey: Keys.showDimensions) as? Bool ?? true
    }
}
