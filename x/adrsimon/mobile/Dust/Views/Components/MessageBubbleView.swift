import MarkdownUI
import SparkleTokens
import SwiftUI

struct MessageBubbleView: View {
    let message: ConversationMessage
    let currentUserEmail: String
    var streamingPhase: AgentStreamingPhase = .idle
    var activeActions: [ActiveAction] = []
    var onFragmentTap: ((ContentFragment) -> Void)?

    var body: some View {
        switch message {
        case let .user(msg):
            if msg.context?.email == currentUserEmail {
                UserMessageBubble(message: msg, onFragmentTap: onFragmentTap)
            } else {
                OtherUserMessageBubble(message: msg, onFragmentTap: onFragmentTap)
            }
        case let .agent(msg):
            AgentMessageBubble(
                message: msg,
                streamingPhase: streamingPhase,
                activeActions: activeActions
            )
        }
    }
}

struct UserMessageBubble: View {
    let message: UserMessage
    var onFragmentTap: ((ContentFragment) -> Void)?

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            if let fragments = message.contentFragments, !fragments.isEmpty {
                ContentFragmentList(fragments: fragments, onTap: onFragmentTap)
            }

            if !message.content.isEmpty {
                Markdown(preprocessDirectives(message.content))
                    .markdownTheme(.dust)
                    .lineSpacing(4)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.dustMutedBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.top, 12)
    }
}

struct OtherUserMessageBubble: View {
    let message: UserMessage
    var onFragmentTap: ((ContentFragment) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Avatar(url: message.context?.profilePictureUrl)

                Text(message.context?.fullName ?? message.context?.username ?? "User")
                    .sparkleLabelXs()
                    .foregroundStyle(Color.dustForeground)
            }

            if let fragments = message.contentFragments, !fragments.isEmpty {
                ContentFragmentList(fragments: fragments, onTap: onFragmentTap)
            }

            if !message.content.isEmpty {
                Markdown(preprocessDirectives(message.content))
                    .markdownTheme(.dust)
                    .lineSpacing(4)
                    .textSelection(.enabled)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
    }
}

struct AgentMessageBubble: View {
    let message: AgentMessage
    var streamingPhase: AgentStreamingPhase = .idle
    var activeActions: [ActiveAction] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Avatar(url: message.configuration.pictureUrl)

                Text("@\(message.configuration.name)")
                    .sparkleLabelXs()
                    .foregroundStyle(Color.dustForeground)
            }

            if message.isStreaming {
                StreamingStatusView(
                    phase: streamingPhase,
                    activeActions: activeActions,
                    chainOfThought: message.chainOfThought
                )
            }

            // Show content (streamed or final)
            if let content = message.content, !content.isEmpty {
                StreamingMarkdownView(rawContent: content, isStreaming: message.isStreaming)
                    .textSelection(!message.isStreaming)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
    }
}

// MARK: - Content Fragments

struct ContentFragmentList: View {
    let fragments: [ContentFragment]
    var onTap: ((ContentFragment) -> Void)?

    var body: some View {
        FlowLayout(spacing: 4) {
            ForEach(fragments) { fragment in
                ContentFragmentChip(fragment: fragment, onTap: onTap)
            }
        }
    }
}

struct ContentFragmentChip: View {
    let fragment: ContentFragment
    var onTap: ((ContentFragment) -> Void)?

    private var isTappable: Bool {
        fragment.fileId != nil && onTap != nil
    }

    var body: some View {
        Button {
            onTap?(fragment)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: Attachment.sfSymbol(for: fragment.contentType))
                    .font(.system(size: 13))
                    .foregroundStyle(Color.highlight)

                Text(fragment.title)
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustForeground)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.dustMutedBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .disabled(!isTappable)
    }
}

// swiftlint:disable identifier_name
private struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    struct CacheData {
        var sizes: [CGSize]
        var rows: [[Int]]
    }

    func makeCache(subviews: Subviews) -> CacheData {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        return CacheData(sizes: sizes, rows: [])
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout CacheData) -> CGSize {
        cache.sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        cache.rows = computeRows(proposal: proposal, sizes: cache.sizes)
        var height: CGFloat = 0
        for (i, row) in cache.rows.enumerated() {
            let rowHeight = row.map { cache.sizes[$0].height }.max() ?? 0
            height += rowHeight + (i > 0 ? spacing : 0)
        }
        return CGSize(width: proposal.width ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout CacheData) {
        var y = bounds.minY
        for row in cache.rows {
            let rowHeight = row.map { cache.sizes[$0].height }.max() ?? 0
            var x = bounds.maxX
            for index in row.reversed() {
                let size = cache.sizes[index]
                x -= size.width
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x -= spacing
            }
            y += rowHeight + spacing
        }
    }

    private func computeRows(proposal: ProposedViewSize, sizes: [CGSize]) -> [[Int]] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [[Int]] = [[]]
        var rowWidth: CGFloat = 0
        for (i, size) in sizes.enumerated() {
            if !rows[rows.count - 1].isEmpty, rowWidth + spacing + size.width > maxWidth {
                rows.append([])
                rowWidth = 0
            }
            if rowWidth > 0 { rowWidth += spacing }
            rowWidth += size.width
            rows[rows.count - 1].append(i)
        }
        return rows
    }
}

// swiftlint:enable identifier_name

// MARK: - Streaming Status

struct StreamingStatusView: View {
    let phase: AgentStreamingPhase
    let activeActions: [ActiveAction]
    let chainOfThought: String?

    var body: some View {
        if isBlockingState {
            blockingChip
        } else {
            statusArea
        }
    }

    // MARK: - Thinking / Acting / Generating

    private var statusArea: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Chain of thought text, visible while it streams in
            if let text = chainOfThought, !text.isEmpty {
                Text(text)
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustFaint)
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Active actions
            if !activeActions.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(activeActions) { action in
                        ActionRow(action: action)
                    }
                }
                .padding(.top, chainOfThought?.isEmpty == false ? 6 : 0)
            } else {
                // Thinking or generating (no active actions)
                HStack(spacing: 6) {
                    PulsingDot()
                        .frame(width: 14, height: 14)

                    Text(phase == .generating ? "Writing…" : "Thinking…")
                        .sparkleCopyXs()
                        .foregroundStyle(Color.dustFaint)
                        .lineLimit(1)
                }
                .padding(.top, chainOfThought?.isEmpty == false ? 6 : 0)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Blocking states

    private var blockingChip: some View {
        HStack(spacing: 6) {
            blockingIcon
                .frame(width: 14, height: 14)

            Text(blockingLabel)
                .sparkleCopyXs()
                .foregroundStyle(Color.warning600)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.warning100)
        .clipShape(Capsule())
    }

    @ViewBuilder
    private var blockingIcon: some View {
        switch phase {
        case .approvalRequired:
            SparkleIcon.stopSign.image
                .resizable()
                .scaledToFit()
                .foregroundStyle(Color.warning600)
        default:
            SparkleIcon.lock.image
                .resizable()
                .scaledToFit()
                .foregroundStyle(Color.warning600)
        }
    }

    private var blockingLabel: String {
        switch phase {
        case let .personalAuthRequired(provider): "Authentication required (\(provider))"
        case let .fileAuthRequired(fileName): "File access required (\(fileName))"
        case .approvalRequired: "Approval required"
        default: ""
        }
    }

    private var isBlockingState: Bool {
        switch phase {
        case .personalAuthRequired, .fileAuthRequired, .approvalRequired: true
        default: false
        }
    }
}

// MARK: - Action Row

struct ActionRow: View {
    let action: ActiveAction

    var body: some View {
        HStack(spacing: 6) {
            icon
                .frame(width: 14, height: 14)

            Text(action.label)
                .sparkleCopyXs()
                .foregroundStyle(Color.dustFaint)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var icon: some View {
        if let serverIcon = action.serverName.flatMap(MCPServerIcon.icon(for:)) {
            serverIcon.image
                .resizable()
                .scaledToFit()
        } else {
            PulsingDot()
        }
    }
}

// MARK: - Pulsing Dot

struct PulsingDot: View {
    @State private var isAnimating = false

    var body: some View {
        Circle()
            .fill(Color.dustFaint)
            .frame(width: 6, height: 6)
            .opacity(isAnimating ? 0.3 : 1.0)
            .animation(
                .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
                value: isAnimating
            )
            .onAppear { isAnimating = true }
    }
}

// MARK: - Helpers

private extension View {
    @ViewBuilder
    func textSelection(_ enabled: Bool) -> some View {
        if enabled {
            textSelection(.enabled)
        } else {
            self
        }
    }
}
