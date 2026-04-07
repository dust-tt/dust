import Foundation

// MARK: - Step 1: Create file record → get upload URL

struct FileUploadRequest: Encodable {
    let contentType: String
    let fileName: String
    let fileSize: Int
    let useCase: String = "conversation"
}

struct FileUploadResponse: Decodable {
    let file: UploadedFile
}

struct UploadedFile: Decodable {
    let sId: String
    let uploadUrl: String
}

// MARK: - Step 2: Upload file content → get result

struct FileUploadedResponse: Decodable {
    let file: UploadedFileResult
}

struct UploadedFileResult: Decodable {
    let sId: String
    let downloadUrl: String?
}
