import Foundation

struct PodFileEntry: Decodable, Identifiable, Hashable {
    static let fallbackContentType = "application/octet-stream"

    let path: String
    let fileName: String
    let isDirectory: Bool
    let lastModifiedMs: Double
    let contentType: String?
    let fileId: String?
    let fileResourceContentType: String?

    var id: String {
        path
    }

    var displayContentType: String {
        fileResourceContentType ?? contentType ?? Self.fallbackContentType
    }

    var category: AttachmentCategory {
        AttachmentCategory(contentType: displayContentType)
    }

    var reference: FileReference {
        fileId.map(FileReference.id) ?? .path(path)
    }

    var lastModifiedDate: Date {
        lastModifiedMs.dateFromEpochMs
    }
}

struct PodFilesResponse: Decodable {
    let files: [PodFileEntry]
}

struct PodFolder: Hashable {
    static let podPathPrefix = "pod-"

    let path: String

    static func root(spaceId: String) -> PodFolder {
        PodFolder(path: podPathPrefix + spaceId)
    }

    var name: String {
        path.split(separator: "/").last.map(String.init) ?? path
    }
}

/**
 * @cc [owner:adrsimon,label:product] pod-folder-listing
 * The listing of `folder` MUST contain every direct child folder implied by an entry path under it,
 * even when the API returns no directory entry for that folder, and only the files whose parent
 * is exactly `folder`.
 */
struct PodFolderListing {
    let folders: [PodFolder]
    let files: [PodFileEntry]

    init(entries: [PodFileEntry], folder: PodFolder) {
        let prefix = folder.path + "/"
        var childFolderPaths = Set<String>()
        var files: [PodFileEntry] = []

        for entry in entries where entry.path.hasPrefix(prefix) {
            let segments = entry.path.dropFirst(prefix.count).split(separator: "/")
            guard let first = segments.first else { continue }
            if segments.count > 1 || entry.isDirectory {
                childFolderPaths.insert(prefix + first)
            } else {
                files.append(entry)
            }
        }

        self.folders = childFolderPaths.sorted().map(PodFolder.init(path:))
        self.files = files.sorted { $0.fileName.localizedStandardCompare($1.fileName) == .orderedAscending }
    }
}
