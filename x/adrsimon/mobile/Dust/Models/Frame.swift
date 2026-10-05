import Foundation

struct FramePermissions: Decodable {
    let isFrameAuthor: Bool
    let packageRoot: String?
}

struct FileUseCaseMetadataResponse: Decodable {
    struct UseCaseMetadata: Decodable {
        let conversationId: String?
        let spaceId: String?
    }

    let useCaseMetadata: UseCaseMetadata
}

struct FrameFileContext {
    static let empty = FrameFileContext(conversationId: nil, spaceId: nil, packageRoot: nil, isFrameAuthor: false)

    private static let fileIdPrefix = "fil_"
    private static let conversationScopedPrefix = "conversation-"
    private static let podScopedPrefix = "pod-"
    private static let conversationRelativePrefix = "conversation/"
    private static let podRelativePrefixes = ["pod/", "project/"]
    private static let scopedLookingPrefix = #/^(conversation|pod|project)[-\/]/#
    private static let currentDirectoryPrefix = "./"

    let conversationId: String?
    let spaceId: String?
    let packageRoot: String?
    let isFrameAuthor: Bool

    /**
     * @cc [owner:adrsimon,label:product;security] frame-file-reference-resolution
     * A `getFile` id from a frame MUST resolve exactly like the web host's `resolveReadUrl`:
     * scoped `conversation-…`/`pod-…` paths as-is, `conversation/<rel>` and `pod/<rel>` (or
     * `project/<rel>`) against the frame's conversation and pod, `fil_…` ids by id, and any other
     * value as a path relative to `packageRoot`. A relative path with an empty, `.` or `..`
     * segment, or a reference whose required conversation, pod or package root is unknown, MUST
     * resolve to nil and never fall back to another scope.
     */
    func reference(for frameFileId: String) -> FileReference? {
        let fileId = frameFileId.trimmingCharacters(in: .whitespaces)

        if fileId.hasPrefix(Self.conversationScopedPrefix) || fileId.hasPrefix(Self.podScopedPrefix) {
            return .path(fileId)
        }
        if fileId.hasPrefix(Self.conversationRelativePrefix) {
            let relativePath = fileId.dropFirst(Self.conversationRelativePrefix.count)
            return conversationId.map { .path("\(Self.conversationScopedPrefix)\($0)/\(relativePath)") }
        }
        if let podPrefix = Self.podRelativePrefixes.first(where: fileId.hasPrefix) {
            let relativePath = fileId.dropFirst(podPrefix.count)
            return spaceId.map { .path("\(Self.podScopedPrefix)\($0)/\(relativePath)") }
        }
        if fileId.hasPrefix(Self.fileIdPrefix) {
            return .id(fileId)
        }
        guard fileId.firstMatch(of: Self.scopedLookingPrefix) == nil else { return nil }
        return packageRelativeReference(fileId)
    }

    private func packageRelativeReference(_ fileId: String) -> FileReference? {
        guard let packageRoot, packageRoot.contains("/") else { return nil }
        let root = packageRoot.hasSuffix("/") ? String(packageRoot.dropLast()) : packageRoot
        let withoutDot = fileId.hasPrefix(Self.currentDirectoryPrefix)
            ? String(fileId.dropFirst(Self.currentDirectoryPrefix.count))
            : fileId
        let relativePath = withoutDot.hasPrefix(root + "/") ? String(withoutDot.dropFirst(root.count + 1)) : withoutDot
        let segments = relativePath.split(separator: "/", omittingEmptySubsequences: false)
        guard !segments.isEmpty, segments.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
            return nil
        }
        return .path("\(root)/\(relativePath)")
    }
}

struct FrameUserIdentity: Encodable {
    struct User: Encodable {
        let sId: String
        let firstName: String
        let lastName: String?
        let fullName: String
        let image: String?
    }

    static let anonymous = FrameUserIdentity(
        isAuthenticated: false,
        isWorkspaceMember: false,
        isPodEditor: false,
        isPodMember: false,
        isFrameAuthor: false,
        user: nil
    )

    let isAuthenticated: Bool
    let isWorkspaceMember: Bool
    let isPodEditor: Bool
    let isPodMember: Bool
    let isFrameAuthor: Bool
    let user: User?
}

extension FrameUserIdentity {
    init(user: DustUser, isFrameAuthor: Bool) {
        let fullName = [user.firstName, user.lastName].compactMap { $0 }.joined(separator: " ")
        self.init(
            isAuthenticated: true,
            isWorkspaceMember: true,
            isPodEditor: false,
            isPodMember: false,
            isFrameAuthor: isFrameAuthor,
            user: User(
                sId: user.sId,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: fullName,
                image: user.image
            )
        )
    }
}

struct FrameFilePayload: Encodable {
    static let missing = FrameFilePayload(base64: nil, contentType: nil)

    let base64: String?
    let contentType: String?
}

struct FrameHostRequest: Decodable {
    enum Command: String, Decodable {
        case getFile
        case getUserIdentity
        case setErrorMessage
    }

    let command: Command
    let fileId: String?
    let errorMessage: String?
}
