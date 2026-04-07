import SwiftUI
import UniformTypeIdentifiers

struct DocumentPickerView: UIViewControllerRepresentable {
    let onSelect: ([DocumentPickerResult]) -> Void

    private static let supportedTypes: [UTType] = [
        .pdf, .plainText, .utf8PlainText,
        .image, .png, .jpeg,
        .commaSeparatedText, .spreadsheet,
        .json, .xml, .html,
    ]

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: Self.supportedTypes)
        picker.allowsMultipleSelection = true
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: UIDocumentPickerViewController, context _: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelect: onSelect)
    }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onSelect: ([DocumentPickerResult]) -> Void

        init(onSelect: @escaping ([DocumentPickerResult]) -> Void) {
            self.onSelect = onSelect
        }

        func documentPicker(_: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            var items: [DocumentPickerResult] = []

            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                guard let data = try? Data(contentsOf: url) else { continue }

                let fileName = url.lastPathComponent
                let contentType = url.mimeType

                items.append(DocumentPickerResult(
                    data: data,
                    fileName: fileName,
                    contentType: contentType
                ))
            }

            onSelect(items)
        }

        func documentPickerWasCancelled(_: UIDocumentPickerViewController) {}
    }
}

struct DocumentPickerResult {
    let data: Data
    let fileName: String
    let contentType: String
}

private extension URL {
    var mimeType: String {
        guard let utType = UTType(filenameExtension: pathExtension) else {
            return "application/octet-stream"
        }
        return utType.preferredMIMEType ?? "application/octet-stream"
    }
}
