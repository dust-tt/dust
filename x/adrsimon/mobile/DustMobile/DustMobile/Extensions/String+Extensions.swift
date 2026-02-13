import Foundation

extension String {
    /// Truncate string to a maximum length with ellipsis
    func truncated(to maxLength: Int) -> String {
        if count <= maxLength { return self }
        return String(prefix(maxLength - 1)) + "..."
    }

    /// Extract mentions (@name) from text
    var extractedMentions: [String] {
        let pattern = "@(\\w+)"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(startIndex..., in: self)
        return regex.matches(in: self, range: range).compactMap { match in
            guard let range = Range(match.range(at: 1), in: self) else { return nil }
            return String(self[range])
        }
    }
}
