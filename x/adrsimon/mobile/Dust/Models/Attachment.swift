import SwiftUI

struct Attachment: Identifiable {
    let id = UUID()
    let fileName: String
    let contentType: String
    let fileSize: Int
    var data: Data?
    let thumbnailImage: UIImage?
    var uploadState: UploadState = .pending

    enum UploadState {
        case pending
        case uploading
        case uploaded(fileId: String)
        case failed(error: String)
    }

    var isImage: Bool {
        contentType.hasPrefix("image/")
    }

    var fileId: String? {
        if case let .uploaded(fileId) = uploadState { return fileId }
        return nil
    }

    var isFinished: Bool {
        switch uploadState {
        case .uploaded, .failed: true
        default: false
        }
    }

    static let frameContentTypePrefix = "application/vnd.dust.frame"

    static func isFrame(_ contentType: String) -> Bool {
        contentType.hasPrefix(frameContentTypePrefix)
    }

    static func sfSymbol(for contentType: String) -> String {
        if contentType.hasPrefix(frameContentTypePrefix) { return "rectangle.on.rectangle" }
        if contentType.hasPrefix("image/") { return "photo" }
        if contentType.contains("pdf") { return "doc.richtext" }
        if contentType.contains("text") || contentType.contains("json")
            || contentType.contains("xml") || contentType.contains("html")
        { return "doc.text" }
        if contentType.contains("spreadsheet") || contentType.contains("csv") { return "tablecells" }
        return "doc"
    }
}
