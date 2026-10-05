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

    var category: AttachmentCategory {
        AttachmentCategory(contentType: contentType)
    }
}

enum AttachmentCategory: String, CaseIterable {
    case frame = "Frames"
    case image = "Images"
    case document = "Documents"
    case other = "Other"

    init(contentType: String) {
        if Attachment.isFrame(contentType) {
            self = .frame
        } else if contentType.hasPrefix("image/") {
            self = .image
        } else if contentType.contains("pdf") || contentType.contains("text") || contentType.contains("json")
            || contentType.contains("xml") || contentType.contains("html")
        {
            self = .document
        } else {
            self = .other
        }
    }
}

struct ConversationAttachmentsResponse: Decodable {
    let attachments: [ConversationAttachment]
}
