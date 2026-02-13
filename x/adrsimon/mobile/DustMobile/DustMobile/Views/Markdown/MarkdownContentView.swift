import SwiftUI
import MarkdownUI

struct MarkdownContentView: View {
    let content: String

    var body: some View {
        Markdown(content)
            .markdownTextStyle {
                FontSize(15)
            }
            .markdownBlockStyle(\.codeBlock) { configuration in
                configuration.label
                    .padding(12)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .markdownTextStyle {
                        FontFamilyVariant(.monospaced)
                        FontSize(13)
                    }
            }
    }
}

struct CitationView: View {
    let reference: String
    let title: String
    let sourceUrl: String?

    var body: some View {
        HStack(spacing: 6) {
            Text("[\(reference)]")
                .font(.caption.bold())
                .foregroundStyle(.blue)

            Text(title)
                .font(.caption)
                .foregroundStyle(.primary)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.blue.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}
