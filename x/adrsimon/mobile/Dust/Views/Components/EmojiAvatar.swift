import SparkleTokens
import SwiftUI

/// Dust encodes emoji-based avatars as URLs of the form
/// `.../emojis/bg-{color}-{shade}/{id}/{unified}` rather than real image files.
/// The web client parses these and renders the native emoji on a Tailwind
/// background; there is no image to fetch (the URL 404s). This mirrors that
/// parsing so the mobile `Avatar` can render the emoji instead of a placeholder.
struct EmojiAvatar {
    let emoji: String
    let backgroundColor: Color

    init?(urlString: String) {
        guard let range = urlString.range(of: "/emojis/bg-") else {
            return nil
        }
        let parts = urlString[range.upperBound...].split(separator: "/")
        guard parts.count >= 3 else {
            return nil
        }

        let unified = parts[2].prefix { $0 != "." && $0 != "?" }
        guard let emoji = Self.emoji(fromUnified: String(unified)) else {
            return nil
        }

        // The emoji is the content: render it even when the background color is
        // an unknown Tailwind family, falling back to a neutral background.
        self.emoji = emoji
        self.backgroundColor = Self.backgroundColor(for: String(parts[0])) ?? .gray100
    }

    /// `unified` is a hyphen-separated list of hex Unicode code points
    /// (e.g. `1f468-200d-1f4bb`); concatenating the scalars rebuilds the emoji.
    private static func emoji(fromUnified unified: String) -> String? {
        var scalars = String.UnicodeScalarView()
        for segment in unified.split(separator: "-") {
            guard let code = UInt32(segment, radix: 16),
                  let scalar = Unicode.Scalar(code)
            else {
                return nil
            }
            scalars.append(scalar)
        }
        return scalars.isEmpty ? nil : String(scalars)
    }

    /// Maps a `{color}-{shade}` token (e.g. `pink-300`) to the matching Sparkle
    /// palette color (shades 100…800). Stock/legacy Tailwind family names are
    /// aliased to the nearest Sparkle family, mirroring how the web's Tailwind
    /// config aliases e.g. `amber`→`golden` and `sky`→`blue`.
    private static func backgroundColor(for token: String) -> Color? {
        let components = token.split(separator: "-")
        guard components.count == 2, let shade = Int(components[1]) else {
            return nil
        }
        let family = familyAliases[String(components[0])] ?? String(components[0])
        let index = shade / 100 - 1
        guard let palette = palettes[family], palette.indices.contains(index) else {
            return nil
        }
        return palette[index]
    }

    private static let familyAliases: [String: String] = [
        "yellow": "golden",
        "amber": "golden",
        "sky": "blue",
        "cyan": "blue",
        "teal": "emerald",
        "indigo": "violet",
        "purple": "violet",
        "fuchsia": "pink",
        "slate": "gray",
        "zinc": "gray",
        "neutral": "gray",
        "stone": "gray",
    ]

    private static let palettes: [String: [Color]] = [
        "gray": [.gray100, .gray200, .gray300, .gray400, .gray500, .gray600, .gray700, .gray800],
        "blue": [.blue100, .blue200, .blue300, .blue400, .blue500, .blue600, .blue700, .blue800],
        "violet": [.violet100, .violet200, .violet300, .violet400, .violet500, .violet600, .violet700, .violet800],
        "pink": [.pink100, .pink200, .pink300, .pink400, .pink500, .pink600, .pink700, .pink800],
        "rose": [.rose100, .rose200, .rose300, .rose400, .rose500, .rose600, .rose700, .rose800],
        "red": [.red100, .red200, .red300, .red400, .red500, .red600, .red700, .red800],
        "orange": [.orange100, .orange200, .orange300, .orange400, .orange500, .orange600, .orange700, .orange800],
        "golden": [.golden100, .golden200, .golden300, .golden400, .golden500, .golden600, .golden700, .golden800],
        "lime": [.lime100, .lime200, .lime300, .lime400, .lime500, .lime600, .lime700, .lime800],
        "green": [.green100, .green200, .green300, .green400, .green500, .green600, .green700, .green800],
        "emerald": [
            .emerald100,
            .emerald200,
            .emerald300,
            .emerald400,
            .emerald500,
            .emerald600,
            .emerald700,
            .emerald800,
        ],
    ]
}
