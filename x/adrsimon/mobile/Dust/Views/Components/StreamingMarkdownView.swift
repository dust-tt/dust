import MarkdownUI
import SwiftUI

/// A markdown view that throttles re-renders during streaming to avoid
/// re-parsing the entire document on every token (~30/sec → ~7/sec).
/// When streaming ends, the final content is rendered immediately.
struct StreamingMarkdownView: View {
    let rawContent: String
    let isStreaming: Bool

    @State private var displayContent: String = ""
    @State private var throttleTask: DispatchWorkItem?

    private static let throttleInterval: TimeInterval = 0.15

    var body: some View {
        Markdown(displayContent)
            .markdownTheme(.dust)
            .lineSpacing(4)
            .onChange(of: rawContent) { _, newValue in
                if isStreaming {
                    scheduleUpdate(newValue)
                } else {
                    applyImmediately(newValue)
                }
            }
            .onChange(of: isStreaming) { _, streaming in
                if !streaming {
                    applyImmediately(rawContent)
                }
            }
            .onAppear {
                displayContent = preprocessDirectives(rawContent)
            }
    }

    private func scheduleUpdate(_ content: String) {
        throttleTask?.cancel()
        let work = DispatchWorkItem {
            displayContent = preprocessDirectives(content)
        }
        throttleTask = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + Self.throttleInterval,
            execute: work
        )
    }

    private func applyImmediately(_ content: String) {
        throttleTask?.cancel()
        throttleTask = nil
        displayContent = preprocessDirectives(content)
    }
}
