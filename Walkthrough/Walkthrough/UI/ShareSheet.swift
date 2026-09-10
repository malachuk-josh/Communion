import SwiftUI
import UIKit

struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

/// A plain share sheet. Exports are written to disk first and shared as file
/// URLs, so Mail, Files and AirDrop all get a real document.
struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
