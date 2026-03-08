import Foundation
import MarkdownUI
import SparkleTokens
import SwiftUI

// MARK: - Directive Preprocessing

// Transforms Dust custom markdown directives into standard markdown
// before passing to MarkdownUI which only supports GFM.
// swiftlint:disable:next force_try
private let mentionRegex = try! NSRegularExpression(pattern: #":mention(?:_user)?\[([^\]]*)\]\{[^}]*\}"#)
// swiftlint:disable:next force_try
private let citeRegex = try! NSRegularExpression(pattern: #":cite\[([^\]]*)\]\{[^}]*\}"#)

func preprocessDirectives(_ markdown: String) -> String {
    var result = markdown
    let range = NSRange(result.startIndex..., in: result)

    // :mention[Name]{sId=xxx} / :mention_user[Name]{sId=xxx} → [@Name](dust://mention)
    result = mentionRegex.stringByReplacingMatches(in: result, range: range, withTemplate: "[@$1](dust://mention)")

    // :cite[refs]{} → [refs]
    let citeRange = NSRange(result.startIndex..., in: result)
    result = citeRegex.stringByReplacingMatches(in: result, range: citeRange, withTemplate: "[$1]")

    return result
}

// MARK: - Markdown Theme

extension MarkdownUI.Theme {
    static let dust = Theme()
        .text {
            ForegroundColor(Color.dustForeground)
            FontSize(SparkleFont.smSize)
            FontFamily(.custom("Geist"))
        }
        .link {
            ForegroundColor(Color.primary800)
            FontWeight(.semibold)
        }
        .strong {
            FontWeight(.semibold)
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
                .markdownMargin(top: 2, bottom: 2)
        }
}
