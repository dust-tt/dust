import Foundation
import MarkdownUI
import SparkleTokens
import SwiftUI

// MARK: - Directive Preprocessing

// Transforms Dust custom markdown directives into standard markdown
// before passing to MarkdownUI which only supports GFM.
// swiftlint:disable:next force_try
private let citeRegex = try! NSRegularExpression(pattern: #":cite\[([^\]]*)\](?:\{[^}]*\})?"#)

func preprocessDirectives(_ markdown: String) -> String {
    // :cite[ref1,ref2]{} → ¹² (unicode superscript numbers)
    processCiteDirectives(replaceInlineDirectives(markdown)).text
}

/**
 * @cc [owner:adrsimon,label:product] inline-directives-render-inline
 * Mentions MUST become `[@Name](dust://mention)` links. Skill tags carrying a `name` and
 * `:pasted_attachment` / `:pasted_content` directives MUST become inline `InlineChip` images at
 * their original position; a skill tag without a `name` is removed.
 */
private func replaceInlineDirectives(_ markdown: String) -> String {
    markdown
        .replacing(mentionDirectiveRegex) { "[@\($0.output.name)](dust://mention)" }
        .replacing(skillTagRegex) { match in
            skillTagName(match.output.attributes).map { InlineChip.skill.markdown(label: $0) } ?? ""
        }
        .replacing(pastedDirectiveRegex) { InlineChip.pasted.markdown(label: String($0.output.title)) }
}

/// Single-pass processing of :cite directives. Returns both the transformed markdown
/// and the ordered mapping of ref keys to sequential numbers.
func processCiteDirectives(_ markdown: String) -> (text: String, mapping: [CiteEntry]) {
    var counter = 0
    var seen: [String: Int] = [:]
    var ordered: [CiteEntry] = []
    var result = ""
    var lastEnd = markdown.startIndex
    let matches = citeRegex.matches(in: markdown, range: NSRange(location: 0, length: (markdown as NSString).length))

    for match in matches {
        guard let matchRange = Range(match.range, in: markdown),
              let refsRange = Range(match.range(at: 1), in: markdown)
        else { continue }

        result += markdown[lastEnd ..< matchRange.lowerBound]

        let markers = markdown[refsRange].split(separator: ",").compactMap { part -> String? in
            let ref = part.trimmingCharacters(in: .whitespaces)
            guard !ref.isEmpty else { return nil }
            if seen[ref] == nil {
                counter += 1
                seen[ref] = counter
                ordered.append(CiteEntry(ref: ref, number: counter))
            }
            return superscript(seen[ref]!)
        }
        result += markers.joined(separator: "\u{2009}")
        lastEnd = matchRange.upperBound
    }
    result += markdown[lastEnd...]
    return (result, ordered)
}

private let superscriptDigits: [Character] = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"]

private func superscript(_ number: Int) -> String {
    String(String(number).map { superscriptDigits[Int(String($0))!] })
}

struct CiteEntry: Equatable {
    let ref: String
    let number: Int
}

/// An agent message's content run through the directive pipeline once: the
/// display markdown and the citation mapping both come from a single cite pass,
/// so consumers never re-scan the content.
struct RenderedAgentMessage: Equatable {
    let displayMarkdown: String
    let citeMapping: [CiteEntry]
    let suggestionBatchIds: [String]

    static let empty = RenderedAgentMessage(displayMarkdown: "", citeMapping: [], suggestionBatchIds: [])

    init(content: String) {
        let suggestions = extractSuggestionBatches(content)
        let cited = processCiteDirectives(replaceInlineDirectives(suggestions.text))
        self.displayMarkdown = cited.text
        self.citeMapping = cited.mapping
        self.suggestionBatchIds = suggestions.batchIds
    }

    private init(displayMarkdown: String, citeMapping: [CiteEntry], suggestionBatchIds: [String]) {
        self.displayMarkdown = displayMarkdown
        self.citeMapping = citeMapping
        self.suggestionBatchIds = suggestionBatchIds
    }
}

private let suggestionRecapRegex = #/:{1,2}suggestion_recap\[[^\]]*\](?:\{[^}]*\})?/#
private let batchEditRegex = #/:{1,2}batch_edit\[\]\{(?<attributes>[^}]*)\}/#
private let batchIdAttributeRegex = #/sId=["']?(?<sId>[^\s}"']+)/#

/**
 * @cc [owner:adrsimon,label:product] suggestion-directives-leave-text
 * `:suggestion_recap[...]` and `:batch_edit[]{sId=...}` directives MUST be removed from the
 * returned text. `batchIds` MUST list each distinct `batch_edit` sId once, in order of first
 * appearance; a `batch_edit` directive without an sId is removed and not listed.
 */
private func extractSuggestionBatches(_ markdown: String) -> (text: String, batchIds: [String]) {
    var batchIds: [String] = []
    for match in markdown.matches(of: batchEditRegex) {
        guard let sId = match.output.attributes.firstMatch(of: batchIdAttributeRegex)?.output.sId else {
            continue
        }
        let batchId = String(sId)
        if !batchIds.contains(batchId) {
            batchIds.append(batchId)
        }
    }
    let text = markdown
        .replacing(suggestionRecapRegex, with: "")
        .replacing(batchEditRegex, with: "")
    return (text, batchIds)
}

// MARK: - Markdown Theme

private struct BaselineOffset: TextStyle {
    let offset: CGFloat

    // swiftlint:disable:next identifier_name
    func _collectAttributes(in attributes: inout AttributeContainer) {
        attributes.baselineOffset = offset
    }
}

extension MarkdownUI.Theme {
    /**
     * @cc [owner:adrsimon,label:product] text-raised-for-inline-chips
     * SwiftUI pins inline images to the text baseline, so all text MUST be raised by
     * `InlineChip.textBaselineRaise` to center chips on the line. That raise already spaces lines:
     * views using this theme MUST NOT add `lineSpacing`.
     */
    static let dust = Theme()
        .text {
            ForegroundColor(Color.dustForeground)
            FontSize(SparkleFont.smSize)
            FontFamily(.custom("Geist"))
            BaselineOffset(offset: InlineChip.textBaselineRaise)
        }
        .link {
            ForegroundColor(Color.highlight)
            UnderlineStyle(.init(pattern: .solid, color: Color.highlight.opacity(0.35)))
        }
        .strong {
            FontWeight(.semibold)
        }
        .paragraph { configuration in
            configuration.label
                .fixedSize(horizontal: false, vertical: true)
                .markdownMargin(top: 0, bottom: 12)
        }
        .table { configuration in
            ScrollView(.horizontal, showsIndicators: false) {
                configuration.label
                    .fixedSize(horizontal: false, vertical: true)
                    .markdownTableBorderStyle(.init(.insideBorders, color: Color.dustBorder))
                    .markdownTableBackgroundStyle(
                        .alternatingRows(Color.clear, Color.clear, header: Color.dustMutedBackground)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: tableCornerRadius))
                    .overlay {
                        RoundedRectangle(cornerRadius: tableCornerRadius)
                            .strokeBorder(Color.dustBorder, lineWidth: 1)
                    }
            }
            .markdownMargin(top: 4, bottom: 16)
        }
        .tableCell { configuration in
            CappedWidth(maxWidth: tableCellMaxWidth) {
                configuration.label
                    .markdownTextStyle {
                        if configuration.row == 0 {
                            FontWeight(.semibold)
                        }
                        FontSize(SparkleFont.xsSize)
                        BackgroundColor(nil)
                    }
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
        }
        .thematicBreak {
            Divider()
                .markdownMargin(top: 16, bottom: 16)
        }
        .code {
            FontFamily(.custom("Geist Mono"))
            FontSize(SparkleFont.xsSize)
            ForegroundColor(Color.dustForeground)
            BackgroundColor(Color.dustFaint.opacity(0.15))
        }
        .codeBlock { configuration in
            ScrollView(.horizontal) {
                configuration.label
                    .markdownTextStyle {
                        FontFamily(.custom("Geist Mono"))
                        FontSize(SparkleFont.xsSize)
                        ForegroundColor(Color.dustForeground)
                    }
                    .padding(12)
            }
            .background(Color.dustFaint.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .heading1 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontFamily(.custom("Geist"))
                    FontWeight(.semibold)
                    FontSize(SparkleFont.xlSize)
                    ForegroundColor(Color.dustForeground)
                }
                .markdownMargin(top: 16, bottom: 8)
        }
        .heading2 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontFamily(.custom("Geist"))
                    FontWeight(.semibold)
                    FontSize(SparkleFont.lgSize)
                    ForegroundColor(Color.dustForeground)
                }
                .markdownMargin(top: 12, bottom: 6)
        }
        .heading3 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontFamily(.custom("Geist"))
                    FontWeight(.semibold)
                    FontSize(SparkleFont.baseSize)
                    ForegroundColor(Color.dustForeground)
                }
                .markdownMargin(top: 10, bottom: 4)
        }
        .blockquote { configuration in
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Color.dustFaint.opacity(0.4))
                    .frame(width: 3)
                configuration.label
                    .markdownTextStyle {
                        ForegroundColor(Color.dustFaint)
                        FontSize(SparkleFont.smSize)
                    }
                    .padding(.leading, 10)
            }
        }
        .listItem { configuration in
            configuration.label
                .markdownMargin(top: 4, bottom: 4)
        }
}

private let tableCornerRadius: CGFloat = 8
private let tableCellMaxWidth: CGFloat = 220

private struct CappedWidth: Layout {
    let maxWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        let width = min(proposal.width ?? maxWidth, maxWidth)
        return subviews.first?.sizeThatFits(ProposedViewSize(width: width, height: nil)) ?? .zero
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
    }
}
