import SparkleTokens
import SwiftUI

/// Context needed to load an authenticated attachment image. Injected once at the
/// conversation level so message bubbles can render image previews without each
/// view threading the workspace id and token provider through its initializer.
struct AttachmentImageContext {
    let workspaceId: String
    let tokenProvider: TokenProvider
}

private struct AttachmentImageContextKey: EnvironmentKey {
    static let defaultValue: AttachmentImageContext? = nil
}

extension EnvironmentValues {
    var attachmentImageContext: AttachmentImageContext? {
        get { self[AttachmentImageContextKey.self] }
        set { self[AttachmentImageContextKey.self] = newValue }
    }
}

private enum AttachmentImageCache {
    static let shared = NSCache<NSString, UIImage>()
}

/// A square thumbnail for an image attachment, matching the input bar's
/// `AttachmentChipView`. Falls back to `FileChip` when no loading context is
/// available or the image can't be decoded.
struct AttachmentImagePreview: View {
    let fileId: String
    let title: String
    let contentType: String
    let isTappable: Bool
    let onTap: () -> Void

    @Environment(\.attachmentImageContext) private var context
    @State private var image: UIImage?
    @State private var didFail = false

    private let side: CGFloat = 64

    var body: some View {
        if didFail || context == nil {
            FileChip(title: title, contentType: contentType, isTappable: isTappable, onTap: onTap)
        } else {
            Button(action: onTap) {
                imageContent
                    .frame(width: side, height: side)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.dustForeground.opacity(0.15), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            .disabled(!isTappable)
            .task(id: fileId) { await load() }
        }
    }

    @ViewBuilder
    private var imageContent: some View {
        if let image {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            Color.dustMutedBackground
                .overlay { ProgressView().scaleEffect(0.7) }
        }
    }

    private func load() async {
        guard image == nil, let context else { return }

        if let cached = AttachmentImageCache.shared.object(forKey: fileId as NSString) {
            image = cached
            return
        }

        do {
            let data = try await FileContentService.fetchFileData(
                workspaceId: context.workspaceId,
                fileId: fileId,
                tokenProvider: context.tokenProvider
            )
            guard let uiImage = UIImage(data: data) else {
                didFail = true
                return
            }
            AttachmentImageCache.shared.setObject(uiImage, forKey: fileId as NSString)
            image = uiImage
        } catch {
            didFail = true
        }
    }
}
