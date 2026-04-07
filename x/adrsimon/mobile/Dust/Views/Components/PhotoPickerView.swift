import PhotosUI
import SwiftUI

struct PhotoPickerView: UIViewControllerRepresentable {
    let onSelect: ([PhotoPickerResult]) -> Void

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.selectionLimit = 10
        config.filter = .any(of: [.images, .screenshots])
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: PHPickerViewController, context _: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelect: onSelect)
    }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onSelect: ([PhotoPickerResult]) -> Void

        init(onSelect: @escaping ([PhotoPickerResult]) -> Void) {
            self.onSelect = onSelect
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            guard !results.isEmpty else { return }

            Task {
                let items = await withTaskGroup(
                    of: PhotoPickerResult?.self,
                    returning: [PhotoPickerResult].self
                ) { group in
                    for result in results {
                        group.addTask { await self.loadItem(from: result) }
                    }
                    var collected: [PhotoPickerResult] = []
                    for await item in group {
                        if let item { collected.append(item) }
                    }
                    return collected
                }
                await MainActor.run {
                    onSelect(items)
                }
            }
        }

        private func loadItem(from result: PHPickerResult) async -> PhotoPickerResult? {
            let provider = result.itemProvider
            let suggestedName = provider.suggestedName

            guard provider.canLoadObject(ofClass: UIImage.self) else { return nil }

            return await withCheckedContinuation { (continuation: CheckedContinuation<PhotoPickerResult?, Never>) in
                provider.loadObject(ofClass: UIImage.self) { object, _ in
                    guard let image = object as? UIImage,
                          let data = image.jpegData(compressionQuality: 0.8)
                    else {
                        continuation.resume(returning: nil)
                        return
                    }

                    let fileName = (suggestedName ?? "photo") + ".jpg"
                    let thumbnail = image.preparingThumbnail(of: CGSize(width: 120, height: 120))

                    continuation.resume(returning: PhotoPickerResult(
                        data: data,
                        fileName: fileName,
                        contentType: "image/jpeg",
                        thumbnail: thumbnail
                    ))
                }
            }
        }
    }
}

struct PhotoPickerResult {
    let data: Data
    let fileName: String
    let contentType: String
    let thumbnail: UIImage?
}
