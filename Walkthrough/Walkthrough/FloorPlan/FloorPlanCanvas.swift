import SwiftUI

struct FloorPlanStyle {
    var wallColor: Color
    var floorFill: Color
    var openingColor: Color
    var windowColor: Color
    var objectStroke: Color
    var labelColor: Color
    var secondaryLabelColor: Color
    var background: Color
    var showRoomLabels: Bool
    var showScaleBar: Bool
    var minimumWallWidth: CGFloat
    var padding: CGFloat

    /// Small, on a card: outline and fill only.
    static let preview = FloorPlanStyle(
        wallColor: .primary,
        floorFill: Color.accentColor.opacity(0.10),
        openingColor: Color(.systemBackground),
        windowColor: .accentColor,
        objectStroke: .secondary.opacity(0.55),
        labelColor: .primary,
        secondaryLabelColor: .secondary,
        background: .clear,
        showRoomLabels: false,
        showScaleBar: false,
        minimumWallWidth: 2,
        padding: 16
    )

    /// Full screen, everything on.
    static let detail = FloorPlanStyle(
        wallColor: .primary,
        floorFill: Color.accentColor.opacity(0.10),
        openingColor: Color(.systemBackground),
        windowColor: .accentColor,
        objectStroke: .secondary.opacity(0.6),
        labelColor: .primary,
        secondaryLabelColor: .secondary,
        background: .clear,
        showRoomLabels: true,
        showScaleBar: true,
        minimumWallWidth: 3,
        padding: 28
    )

    /// Ink on paper: no system colours, since a PDF has no dark mode.
    static let print = FloorPlanStyle(
        wallColor: .black,
        floorFill: Color(white: 0.94),
        openingColor: .white,
        windowColor: Color(white: 0.35),
        objectStroke: Color(white: 0.55),
        labelColor: .black,
        secondaryLabelColor: Color(white: 0.35),
        background: .white,
        showRoomLabels: true,
        showScaleBar: true,
        minimumWallWidth: 2.5,
        padding: 32
    )
}

/// Maps plan metres to view points. Plan y runs south, screen y runs down, so
/// the two happen to agree — but north still needs to end up at the top, which
/// is what the flip here is for.
struct PlanProjection {
    let scale: CGFloat
    let offset: CGSize
    let canvasSize: CGSize

    init(bounds: PlanRect, canvasSize: CGSize, padding: CGFloat) {
        self.canvasSize = canvasSize
        let usableWidth = max(1, canvasSize.width - (padding * 2))
        let usableHeight = max(1, canvasSize.height - (padding * 2))
        let planWidth = CGFloat(max(0.5, bounds.width))
        let planHeight = CGFloat(max(0.5, bounds.height))
        scale = min(usableWidth / planWidth, usableHeight / planHeight)
        let center = bounds.center
        offset = CGSize(width: (canvasSize.width / 2) - (CGFloat(center.x) * scale),
                        height: (canvasSize.height / 2) + (CGFloat(center.y) * scale))
    }

    func point(_ planPoint: PlanPoint) -> CGPoint {
        CGPoint(x: (CGFloat(planPoint.x) * scale) + offset.width,
                y: offset.height - (CGFloat(planPoint.y) * scale))
    }

    func length(_ metres: Double) -> CGFloat { CGFloat(metres) * scale }
}

/// Draws a plan. Pure: no gestures, no state — so the same view backs the
/// on-screen plan, the thumbnail on a project card, and the printed PDF.
struct FloorPlanCanvas: View {
    let plan: FloorPlanData
    var style: FloorPlanStyle = .detail
    var unitSystem: UnitSystem = .imperial
    var showFurniture: Bool = true
    var showDimensions: Bool = true

    var body: some View {
        Canvas { context, size in
            guard !plan.isEmpty else { return }
            let projection = PlanProjection(bounds: plan.bounds.expanded(by: 0.2),
                                            canvasSize: size,
                                            padding: style.padding)
            drawFloors(in: &context, projection: projection)
            drawWalls(in: &context, projection: projection)
            drawOpenings(in: &context, projection: projection)
            if showFurniture { drawObjects(in: &context, projection: projection) }
            if showDimensions { drawWallDimensions(in: &context, projection: projection) }
            if style.showRoomLabels { drawRoomLabels(in: &context, projection: projection) }
            if style.showScaleBar { drawScaleBar(in: &context, projection: projection, size: size) }
        }
        .background(style.background)
    }

    // MARK: - Layers

    private func drawFloors(in context: inout GraphicsContext, projection: PlanProjection) {
        for outline in plan.outlines where outline.polygon.count >= 3 {
            var path = Path()
            path.move(to: projection.point(outline.polygon[0]))
            for point in outline.polygon.dropFirst() {
                path.addLine(to: projection.point(point))
            }
            path.closeSubpath()
            context.fill(path, with: .color(style.floorFill))
        }
    }

    private func drawWalls(in context: inout GraphicsContext, projection: PlanProjection) {
        for wall in plan.walls {
            var path = Path()
            path.move(to: projection.point(wall.start))
            path.addLine(to: projection.point(wall.end))
            let width = max(style.minimumWallWidth, projection.length(wall.thickness))
            context.stroke(path,
                           with: .color(style.wallColor),
                           style: StrokeStyle(lineWidth: width, lineCap: .butt))
        }
    }

    /// Doors and windows are cut out of the wall they sit in, then re-drawn in
    /// their own notation — the way a floor plan reads at a glance.
    private func drawOpenings(in context: inout GraphicsContext, projection: PlanProjection) {
        for opening in plan.openings {
            let start = projection.point(opening.start)
            let end = projection.point(opening.end)
            let wallWidth = max(style.minimumWallWidth, projection.length(hostWallThickness(for: opening)))

            var gap = Path()
            gap.move(to: start)
            gap.addLine(to: end)
            context.stroke(gap,
                           with: .color(style.openingColor),
                           style: StrokeStyle(lineWidth: wallWidth + 1, lineCap: .butt))

            switch opening.kind {
            case .window:
                context.stroke(gap,
                               with: .color(style.windowColor),
                               style: StrokeStyle(lineWidth: max(1, wallWidth * 0.35), lineCap: .butt))
            case .door, .openDoor:
                drawDoorSwing(from: start, to: end, in: &context)
            case .opening:
                context.stroke(gap,
                               with: .color(style.objectStroke),
                               style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
        }
    }

    /// A door leaf and its quarter-circle swing.
    private func drawDoorSwing(from start: CGPoint, to end: CGPoint, in context: inout GraphicsContext) {
        let width = hypot(end.x - start.x, end.y - start.y)
        guard width > 4 else { return }
        let angle = atan2(end.y - start.y, end.x - start.x)
        let hingeAngle = angle - (.pi / 2)

        let leafEnd = CGPoint(x: start.x + (cos(hingeAngle) * width),
                              y: start.y + (sin(hingeAngle) * width))
        var leaf = Path()
        leaf.move(to: start)
        leaf.addLine(to: leafEnd)
        context.stroke(leaf, with: .color(style.wallColor), style: StrokeStyle(lineWidth: 1))

        var arc = Path()
        arc.addArc(center: start,
                   radius: width,
                   startAngle: .radians(angle),
                   endAngle: .radians(hingeAngle),
                   clockwise: true)
        context.stroke(arc,
                       with: .color(style.objectStroke),
                       style: StrokeStyle(lineWidth: 0.75, dash: [2, 2]))
    }

    private func drawObjects(in context: inout GraphicsContext, projection: PlanProjection) {
        for object in plan.objects {
            let center = projection.point(object.center)
            let width = projection.length(object.size.x)
            let depth = projection.length(object.size.y)
            guard width > 2, depth > 2 else { continue }

            context.drawLayer { layer in
                layer.translateBy(x: center.x, y: center.y)
                // Plan y is flipped on screen, so the rotation flips with it.
                layer.rotate(by: .radians(-object.rotation))
                let rect = CGRect(x: -width / 2, y: -depth / 2, width: width, height: depth)
                let path = Path(roundedRect: rect, cornerRadius: min(4, min(width, depth) / 6))
                layer.fill(path, with: .color(style.objectStroke.opacity(0.12)))
                layer.stroke(path, with: .color(style.objectStroke), style: StrokeStyle(lineWidth: 0.75))
            }

            if min(width, depth) > 26 {
                context.draw(Text(Image(systemName: object.category.symbolName))
                    .font(.system(size: min(14, min(width, depth) * 0.4)))
                    .foregroundColor(style.secondaryLabelColor),
                             at: center,
                             anchor: .center)
            }
        }
    }

    private func drawWallDimensions(in context: inout GraphicsContext, projection: PlanProjection) {
        for wall in plan.walls where wall.length > 0.6 {
            let start = projection.point(wall.start)
            let end = projection.point(wall.end)
            guard hypot(end.x - start.x, end.y - start.y) > 34 else { continue }

            let midpoint = CGPoint(x: (start.x + end.x) / 2, y: (start.y + end.y) / 2)
            var angle = atan2(end.y - start.y, end.x - start.x)
            // Keep text the right way up.
            if angle > .pi / 2 { angle -= .pi }
            if angle < -.pi / 2 { angle += .pi }

            let label = Text(Formatting.compactLength(wall.length, system: unitSystem))
                .font(.system(size: 9, weight: .medium).monospacedDigit())
                .foregroundColor(style.secondaryLabelColor)

            context.drawLayer { layer in
                layer.translateBy(x: midpoint.x, y: midpoint.y)
                layer.rotate(by: .radians(angle))
                layer.translateBy(x: 0, y: -8)
                layer.draw(label, at: .zero, anchor: .center)
            }
        }
    }

    private func drawRoomLabels(in context: inout GraphicsContext, projection: PlanProjection) {
        for outline in plan.outlines where outline.polygon.count >= 3 {
            let anchor = projection.point(outline.labelAnchor)
            let name = Text(outline.name)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(style.labelColor)
            let area = Text(Formatting.area(outline.area, system: unitSystem))
                .font(.system(size: 10).monospacedDigit())
                .foregroundColor(style.secondaryLabelColor)
            context.draw(name, at: CGPoint(x: anchor.x, y: anchor.y - 7), anchor: .center)
            context.draw(area, at: CGPoint(x: anchor.x, y: anchor.y + 8), anchor: .center)
        }
    }

    private func drawScaleBar(in context: inout GraphicsContext, projection: PlanProjection, size: CGSize) {
        // One bar of a round real-world length: 5 ft, or 2 m.
        let barMetres: Double = unitSystem == .metric ? 2 : (5 / Formatting.feetPerMetre)
        let barLength = projection.length(barMetres)
        guard barLength > 20, barLength < size.width * 0.6 else { return }

        let y = size.height - 18
        let startX = style.padding * 0.6
        var path = Path()
        path.move(to: CGPoint(x: startX, y: y))
        path.addLine(to: CGPoint(x: startX + barLength, y: y))
        context.stroke(path, with: .color(style.labelColor), style: StrokeStyle(lineWidth: 2, lineCap: .butt))

        for x in [startX, startX + barLength] {
            var tick = Path()
            tick.move(to: CGPoint(x: x, y: y - 4))
            tick.addLine(to: CGPoint(x: x, y: y + 4))
            context.stroke(tick, with: .color(style.labelColor), style: StrokeStyle(lineWidth: 2))
        }

        context.draw(Text(unitSystem == .metric ? "2 m" : "5 ft")
            .font(.system(size: 9, weight: .medium))
            .foregroundColor(style.secondaryLabelColor),
                     at: CGPoint(x: startX + barLength + 16, y: y),
                     anchor: .leading)

        // North arrow, top-right.
        let northOrigin = CGPoint(x: size.width - (style.padding * 0.7), y: style.padding * 0.7)
        var arrow = Path()
        arrow.move(to: CGPoint(x: northOrigin.x, y: northOrigin.y + 14))
        arrow.addLine(to: CGPoint(x: northOrigin.x, y: northOrigin.y - 8))
        context.stroke(arrow, with: .color(style.secondaryLabelColor), style: StrokeStyle(lineWidth: 1.5))
        var head = Path()
        head.move(to: CGPoint(x: northOrigin.x - 4, y: northOrigin.y - 3))
        head.addLine(to: CGPoint(x: northOrigin.x, y: northOrigin.y - 10))
        head.addLine(to: CGPoint(x: northOrigin.x + 4, y: northOrigin.y - 3))
        head.closeSubpath()
        context.fill(head, with: .color(style.secondaryLabelColor))
        context.draw(Text("N").font(.system(size: 9, weight: .bold)).foregroundColor(style.secondaryLabelColor),
                     at: CGPoint(x: northOrigin.x, y: northOrigin.y + 21),
                     anchor: .center)
    }

    // MARK: - Helpers

    /// An opening is drawn as a gap in the wall it belongs to, so it needs that
    /// wall's thickness. RoomPlan does not always name the parent, so the
    /// nearest wall line wins.
    private func hostWallThickness(for opening: PlanOpening) -> Double {
        let midpoint = opening.start.midpoint(opening.end)
        var best = 0.12
        var bestDistance = Double.infinity
        for wall in plan.walls {
            let fraction = min(1, max(0, PlanGeometry.projectionFraction(of: midpoint, onto: wall.start, wall.end)))
            let closest = PlanGeometry.lerp(wall.start, wall.end, fraction)
            let distance = closest.distance(to: midpoint)
            if distance < bestDistance {
                bestDistance = distance
                best = wall.thickness
            }
        }
        return bestDistance < 0.6 ? best : 0.12
    }
}
