import Foundation
import RoomPlan

enum DeviceSupport {
    /// RoomPlan needs a LiDAR scanner and an A12-or-later chip. On an iPhone 16
    /// Pro this is always true; on a simulator or a non-Pro handset it is not.
    static var isSupported: Bool { RoomCaptureSession.isSupported }

    static let unsupportedTitle = "This device can't scan rooms"

    static let unsupportedMessage = """
    Room scanning needs the LiDAR camera, which is only on Pro and Pro Max iPhones and iPad Pro. \
    You can still open and share walkthroughs you've already captured.
    """
}
