import SparkleTokens
import SwiftUI

struct PodFilesSheet: View {
    let workspaceId: String
    let spaceId: String
    let tokenProvider: TokenProvider

    @Environment(\.dismiss) private var dismiss
    @State private var entries: [PodFileEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var folderPath: [PodFolder] = []
    @State private var selectedFile: PodFileEntry?

    var body: some View {
        NavigationStack(path: $folderPath) {
            folderContent(.root(spaceId: spaceId), title: "Pod Files")
                .navigationDestination(for: PodFolder.self) { folder in
                    folderContent(folder, title: folder.name)
                }
        }
        .task {
            await loadEntries()
        }
        .fullScreenCover(item: $selectedFile) { file in
            AttachmentViewerView(
                title: file.fileName,
                contentType: file.displayContentType,
                file: file.reference,
                workspaceId: workspaceId,
                tokenProvider: tokenProvider,
                sourceUrl: nil
            )
        }
    }

    private func folderContent(_ folder: PodFolder, title: String) -> some View {
        let listing = PodFolderListing(entries: entries, folder: folder)
        return ZStack {
            Color.dustBackground.ignoresSafeArea()

            if isLoading {
                ProgressView()
            } else if let errorMessage {
                VStack(spacing: 12) {
                    Text(errorMessage)
                        .sparkleCopySm()
                        .foregroundStyle(Color.dustFaint)
                    Button("Retry") {
                        Task { await loadEntries() }
                    }
                }
            } else if listing.folders.isEmpty, listing.files.isEmpty {
                Text(folder == .root(spaceId: spaceId) ? "No files in this pod" : "This folder is empty")
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustFaint)
            } else {
                filesList(listing)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { dismiss() } label: {
                    SparkleIcon.xClose.image
                        .resizable()
                        .frame(width: 16, height: 16)
                        .foregroundStyle(Color.dustForeground)
                }
            }
        }
    }

    // MARK: - Files List

    private func filesList(_ listing: PodFolderListing) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if !listing.folders.isEmpty {
                    Section {
                        ForEach(listing.folders, id: \.path) { folder in
                            FileListRow(
                                systemImage: "folder",
                                title: folder.name,
                                subtitle: nil,
                                isHighlighted: false,
                                showsChevron: true
                            ) {
                                folderPath.append(folder)
                            }
                        }
                    } header: {
                        FileListSectionHeader(title: "Folders")
                    }
                }

                ForEach(groupedCategories(listing.files), id: \.0) { category, files in
                    Section {
                        ForEach(files) { file in
                            FileListRow(
                                systemImage: Attachment.sfSymbol(for: file.displayContentType),
                                title: file.fileName,
                                subtitle: file.lastModifiedDate.formatted(date: .abbreviated, time: .shortened),
                                isHighlighted: category == .frame,
                                showsChevron: category == .frame
                            ) {
                                selectedFile = file
                            }
                        }
                    } header: {
                        FileListSectionHeader(title: category.rawValue)
                    }
                }
            }
            .padding(.bottom, 16)
        }
    }

    // MARK: - Grouping

    private func groupedCategories(_ files: [PodFileEntry]) -> [(AttachmentCategory, [PodFileEntry])] {
        let grouped = Dictionary(grouping: files, by: \.category)
        return AttachmentCategory.allCases
            .compactMap { category in
                guard let items = grouped[category], !items.isEmpty else { return nil }
                return (category, items)
            }
    }

    // MARK: - Loading

    private func loadEntries() async {
        isLoading = true
        errorMessage = nil
        do {
            entries = try await FileContentService.fetchPodFiles(
                workspaceId: workspaceId,
                spaceId: spaceId,
                tokenProvider: tokenProvider
            )
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }
}
