import SwiftUI

/// The plan you can actually work with: pinch to zoom, drag to pan, double-tap
/// to fit. Wraps `FloorPlanCanvas` rather than duplicating any drawing.
struct FloorPlanView: View {
    let plan: FloorPlanData
    var style: FloorPlanStyle = .detail
    var unitSystem: UnitSystem = .imperial
    var showFurniture: Bool = true
    var showDimensions: Bool = true

    @State private var zoom: CGFloat = 1
    @State private var committedZoom: CGFloat = 1
    @State private var pan: CGSize = .zero
    @State private var committedPan: CGSize = .zero

    var body: some View {
        GeometryReader { geometry in
            FloorPlanCanvas(plan: plan,
                            style: style,
                            unitSystem: unitSystem,
                            showFurniture: showFurniture,
                            showDimensions: showDimensions)
                .frame(width: geometry.size.width, height: geometry.size.height)
                .scaleEffect(zoom)
                .offset(pan)
                .contentShape(Rectangle())
                .gesture(
                    SimultaneousGesture(
                        MagnifyGesture()
                            .onChanged { value in
                                zoom = min(8, max(0.5, committedZoom * value.magnification))
                            }
                            .onEnded { _ in committedZoom = zoom },
                        DragGesture()
                            .onChanged { value in
                                pan = CGSize(width: committedPan.width + value.translation.width,
                                             height: committedPan.height + value.translation.height)
                            }
                            .onEnded { _ in committedPan = pan }
                    )
                )
                .onTapGesture(count: 2) {
                    withAnimation(.spring(duration: 0.3)) { resetView() }
                }
                .clipped()
                .overlay(alignment: .bottomTrailing) {
                    if zoom != 1 || pan != .zero {
                        Button {
                            withAnimation(.spring(duration: 0.3)) { resetView() }
                        } label: {
                            Label("Fit", systemImage: "arrow.up.left.and.down.right.magnifyingglass")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(.thinMaterial, in: Capsule())
                        }
                        .padding(10)
                    }
                }
        }
    }

    private func resetView() {
        zoom = 1
        committedZoom = 1
        pan = .zero
        committedPan = .zero
    }
}
