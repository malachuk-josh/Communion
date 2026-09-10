import Foundation
import SwiftUI
import RoomPlan
import CoreGraphics

/// Turns a walkthrough into files someone else can open: a PDF floor plan, a
/// USDZ model, a room schedule, and the raw scan as JSON.
enum PlanExporter {
    enum ExportError: LocalizedError {
        case couldNotCreatePDF
        case noScanData

        var errorDescription: String? {
            switch self {
            case .couldNotCreatePDF: return "The PDF could not be created."
            case .noScanData: return "This room's 3D scan is no longer on the device."
            }
        }
    }

    /// US Letter, landscape — the shape a floor plan wants, and the paper most
    /// walkthrough reports get printed on.
    static let pageSize = CGSize(width: 792, height: 612)

    // MARK: - PDF

    @MainActor
    static func writePDF(project: WalkProject,
                         plan: FloorPlanData,
                         unitSystem: UnitSystem,
                         showFurniture: Bool,
                         showDimensions: Bool,
                         to url: URL) throws {
        var mediaBox = CGRect(origin: .zero, size: pageSize)
        guard let consumer = CGDataConsumer(url: url as CFURL),
              let pdfContext = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            throw ExportError.couldNotCreatePDF
        }

        let planPage = PlanSheet(project: project,
                                 plan: plan,
                                 unitSystem: unitSystem,
                                 showFurniture: showFurniture,
                                 showDimensions: showDimensions)
            .frame(width: pageSize.width, height: pageSize.height)

        render(planPage, into: pdfContext)

        if !project.rooms.isEmpty {
            let schedulePage = RoomSchedule(project: project, unitSystem: unitSystem)
                .frame(width: pageSize.width, height: pageSize.height)
            render(schedulePage, into: pdfContext)
        }

        pdfContext.closePDF()
    }

    @MainActor
    private static func render(_ view: some View, into pdfContext: CGContext) {
        let renderer = ImageRenderer(content: view)
        renderer.render { _, draw in
            pdfContext.beginPDFPage(nil)
            draw(pdfContext)
            pdfContext.endPDFPage()
        }
    }

    // MARK: - USDZ

    /// Exports the 3D model. Parametric export is the one worth having: it
    /// carries walls, doors and windows as objects a CAD tool can read, rather
    /// than a single baked mesh.
    static func writeUSDZ(capturedRoom: CapturedRoom, to url: URL) throws {
        try capturedRoom.export(to: url, exportOptions: .parametric)
    }

    static func writeUSDZ(structure: CapturedStructure, to url: URL) throws {
        try structure.export(to: url, exportOptions: .parametric)
    }

    // MARK: - Tabular

    static func roomScheduleCSV(project: WalkProject, unitSystem: UnitSystem) -> String {
        let areaUnit = unitSystem == .metric ? "m2" : "sqft"
        let lengthUnit = unitSystem == .metric ? "m" : "ft"
        var lines = ["Room,Type,Floor area (\(areaUnit)),Perimeter (\(lengthUnit)),Ceiling (\(lengthUnit)),Doors,Windows,Notes"]

        func lengthValue(_ metres: Double) -> String {
            let value = unitSystem == .metric ? metres : metres * Formatting.feetPerMetre
            return String(format: "%.2f", value)
        }

        for room in project.rooms {
            let area = String(format: "%.2f", Formatting.areaValue(room.floorArea, system: unitSystem))
            let fields = [
                room.name,
                room.type.displayName,
                area,
                lengthValue(room.plan.wallPerimeter),
                lengthValue(room.ceilingHeight),
                "\(room.doorCount)",
                "\(room.windowCount)",
                room.notes
            ]
            lines.append(fields.map(escapeCSV).joined(separator: ","))
        }

        let total = String(format: "%.2f", Formatting.areaValue(project.totalFloorArea, system: unitSystem))
        lines.append(["Total", "", total, "", "", "", "", ""].map(escapeCSV).joined(separator: ","))
        return lines.joined(separator: "\n")
    }

    private static func escapeCSV(_ field: String) -> String {
        guard field.contains(",") || field.contains("\"") || field.contains("\n") else { return field }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    // MARK: - Filenames

    /// A filename that survives being emailed: no slashes, no colons, no runs of
    /// whitespace.
    static func filename(_ base: String, extension ext: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: " -_"))
        let cleaned = String(base.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" })
            .split(separator: " ", omittingEmptySubsequences: true)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        let safe = cleaned.isEmpty ? "Walkthrough" : cleaned
        return "\(safe).\(ext)"
    }
}
