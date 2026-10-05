import Foundation

let skillTagRegex = #/<skill\s(?<attributes>[^<>]*?)(?:\/>|><\/skill>)/#
let pastedDirectiveRegex = #/:pasted_(?:attachment|content)\[(?<title>[^\]]+)\]\{[^}]*\}/#
let mentionDirectiveRegex = #/:mention(?:_user)?\[(?<name>[^\]]*)\]\{[^}]*\}/#
private let skillNameAttributeRegex = #/\bname="(?<name>[^"]+)"/#

func skillTagName(_ attributes: Substring) -> String? {
    attributes.firstMatch(of: skillNameAttributeRegex).map { String($0.output.name).xmlUnescaped }
}

private extension String {
    static let xmlEntities = [
        ("&quot;", "\""),
        ("&apos;", "'"),
        ("&#39;", "'"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&amp;", "&"),
    ]

    var xmlUnescaped: String {
        Self.xmlEntities.reduce(self) { $0.replacingOccurrences(of: $1.0, with: $1.1) }
    }
}
