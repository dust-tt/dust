import Foundation

struct ConversationAttachment: Codable, Identifiable, Hashable {
    let fileId: String?
    let title: String
    let contentType: String
    let sourceUrl: String?
    let source: String?

    var id: String {
        fileId ?? "\(title)-\(contentType)"
    }

    var isFrame: Bool {
        Attachment.isFrame(contentType)
    }

    var isImage: Bool {
        contentType.hasPrefix("image/")
    }

    var isPDF: Bool {
        contentType.contains("pdf")
    }

    var isText: Bool {
        contentType.contains("text") || contentType.contains("json")
            || contentType.contains("xml") || contentType.contains("html")
    }

    var category: AttachmentCategory {
        if isFrame { return .frame }
        if isImage { return .image }
        if isPDF { return .document }
        if isText { return .document }
        return .other
    }
}

enum AttachmentCategory: String, CaseIterable {
    case frame = "Frames"
    case image = "Images"
    case document = "Documents"
    case other = "Other"
}

struct ConversationAttachmentsResponse: Decodable {
    let attachments: [ConversationAttachment]
}
