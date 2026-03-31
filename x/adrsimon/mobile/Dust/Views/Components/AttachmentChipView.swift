import SparkleTokens
import SwiftUI

struct AttachmentChipView: View {
    let attachment: Attachment
    let onRemove: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            content
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.dustForeground.opacity(0.15), lineWidth: 1)
                )
                .overlay {
                    if case .uploading = attachment.uploadState {
                        Color.black.opacity(0.3)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay {
                                ProgressView()
                                    .progressViewStyle(.circular)
                                    .tint(.white)
                                    .scaleEffect(0.8)
                            }
                    } else if case .failed = attachment.uploadState {
                        Color.black.opacity(0.3)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.red)
                            }
                    }
                }

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(.white, Color.dustForeground.opacity(0.7))
            }
            .offset(x: 6, y: -6)
        }
    }

    @ViewBuilder
    private var content: some View {
        if attachment.isImage, let thumbnail = attachment.thumbnailImage {
            Image(uiImage: thumbnail)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            VStack(spacing: 4) {
                Image(systemName: Attachment.sfSymbol(for: attachment.contentType))
                    .font(.system(size: 20))
                    .foregroundStyle(Color.highlight)
                Text(attachment.fileName)
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustForeground)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .padding(4)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.dustForeground.opacity(0.05))
        }
    }
}
