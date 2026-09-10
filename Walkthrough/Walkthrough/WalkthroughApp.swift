import SwiftUI

@main
struct WalkthroughApp: App {
    @StateObject private var store = ProjectStore()
    @StateObject private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            ProjectListScreen()
                .environmentObject(store)
                .environmentObject(settings)
        }
    }
}
