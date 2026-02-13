import SwiftUI
import PhotosUI

struct AttachmentPickerView: View {
    var viewModel: InputBarViewModel
    @Environment(\.dismiss) var dismiss

    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var showDocumentPicker = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    // Photo picker
                    PhotosPicker(
                        selection: $selectedPhotos,
                        maxSelectionCount: 5,
                        matching: .images
                    ) {
                        Label("Choose Photos", systemImage: "photo.on.rectangle")
                    }
                    .onChange(of: selectedPhotos) { _, newItems in
                        Task {
                            for item in newItems {
                                await loadPhoto(item)
                            }
                            selectedPhotos = []
                            dismiss()
                        }
                    }

                    // Document picker
                    Button {
                        showDocumentPicker = true
                    } label: {
                        Label("Choose File", systemImage: "doc")
                    }
                }
            }
            .navigationTitle("Attach")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .sheet(isPresented: $showDocumentPicker) {
                DocumentPickerView { urls in
                    Task {
                        for url in urls {
                            await loadDocument(url)
                        }
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func loadPhoto(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }

        let contentType: String
        if let identifier = item.supportedContentTypes.first?.identifier {
            contentType = identifier.contains("png") ? "image/png" : "image/jpeg"
        } else {
            contentType = "image/jpeg"
        }

        let fileName = "photo_\(Date().timeIntervalSince1970).\(contentType == "image/png" ? "png" : "jpg")"

        await viewModel.uploadFile(data: data, fileName: fileName, contentType: contentType)
    }

    private func loadDocument(_ url: URL) async {
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }

        guard let data = try? Data(contentsOf: url) else { return }

        let fileName = url.lastPathComponent
        let contentType = mimeType(for: url.pathExtension)

        await viewModel.uploadFile(data: data, fileName: fileName, contentType: contentType)
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "pdf": return "application/pdf"
        case "txt": return "text/plain"
        case "md", "markdown": return "text/markdown"
        case "csv": return "text/csv"
        case "json": return "application/json"
        case "doc", "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "xls", "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "ppt", "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "html", "htm": return "text/html"
        case "xml": return "text/xml"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "py": return "text/x-python"
        case "js": return "text/javascript"
        case "ts": return "text/typescript"
        case "swift": return "text/x-swift"
        case "rs": return "text/x-rust"
        case "go": return "text/x-go"
        case "rb": return "text/x-ruby"
        case "java": return "text/x-java-source"
        case "c", "cpp", "h": return "text/x-c"
        case "sh": return "application/x-sh"
        case "yaml", "yml": return "application/x-yaml"
        case "sql": return "text/x-sql"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - Document Picker UIKit Bridge

struct DocumentPickerView: UIViewControllerRepresentable {
    let onPick: ([URL]) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [
            .pdf, .plainText, .json, .html, .xml,
            .commaSeparatedText, .spreadsheet,
            .presentation, .image, .data,
        ])
        picker.allowsMultipleSelection = true
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: ([URL]) -> Void

        init(onPick: @escaping ([URL]) -> Void) {
            self.onPick = onPick
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onPick(urls)
        }
    }
}
