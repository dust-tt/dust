import MarkdownUI
import SparkleTokens
import SwiftUI

enum InlineChip: String {
    case skill
    case pasted

    static let urlScheme = "dust-chip"
    private static let labelMaxWidth: CGFloat = 200
    static let textBaselineRaise: CGFloat = 4

    var icon: SparkleIcon {
        switch self {
        case .skill: .puzzlePiece01
        case .pasted: .paperclip
        }
    }

    func markdown(label: String) -> String {
        let escaped = label
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "[", with: "\\[")
            .replacingOccurrences(of: "]", with: "\\]")
        return "![\(escaped)](\(Self.urlScheme)://\(rawValue))"
    }

    @MainActor
    fileprivate func render(label: String, colorScheme: ColorScheme, scale: CGFloat) -> UIImage? {
        let renderer = ImageRenderer(
            content: InlineChipView(icon: icon, label: label, maxWidth: Self.labelMaxWidth)
                .environment(\.colorScheme, colorScheme)
        )
        renderer.scale = scale
        return renderer.uiImage
    }
}

private struct InlineChipView: View {
    let icon: SparkleIcon
    let label: String
    let maxWidth: CGFloat

    var body: some View {
        HStack(spacing: 4) {
            icon.image
                .resizable()
                .frame(width: 12, height: 12)
                .foregroundStyle(Color.dustFaint)
            Text(label)
                .sparkleLabelXs()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(1)
                .frame(maxWidth: maxWidth, alignment: .leading)
                .fixedSize()
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color.dustBackground, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.dustBorder, lineWidth: 1))
        .padding(.horizontal, 3)
    }
}

struct InlineChipImageProvider: InlineImageProvider {
    let colorScheme: ColorScheme
    let scale: CGFloat

    func image(with url: URL, label: String) async throws -> Image {
        guard url.scheme == InlineChip.urlScheme, let chip = url.host().flatMap(InlineChip.init(rawValue:)) else {
            return try await DefaultInlineImageProvider.default.image(with: url, label: label)
        }
        guard let image = await chip.render(label: label, colorScheme: colorScheme, scale: scale) else {
            throw URLError(.cannotDecodeContentData)
        }
        return Image(uiImage: image)
    }
}

private struct InlineChipsModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale

    func body(content: Content) -> some View {
        content.markdownInlineImageProvider(InlineChipImageProvider(colorScheme: colorScheme, scale: displayScale))
    }
}

extension View {
    func inlineChips() -> some View {
        modifier(InlineChipsModifier())
    }
}
