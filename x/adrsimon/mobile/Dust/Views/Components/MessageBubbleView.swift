// swiftlint:disable file_length
import MarkdownUI
import SparkleTokens
import SwiftUI

struct MessageBubbleView: View {
    let message: ConversationMessage
    let currentUserEmail: String
    var streamingPhase: AgentStreamingPhase = .idle
    var activeActions: [ActiveAction] = []
    var lastError: ErrorInfo?
    var isValidatingAction: Bool = false
    var onFragmentTap: ((ContentFragment) -> Void)?
    var onGeneratedFileTap: ((GeneratedFile) -> Void)?
    var onCitationTap: ((CitationReference) -> Void)?
    var onValidateAction: ((ActionApproval) -> Void)?
    var onRetry: ((String) -> Void)?
    var onOpenInBrowser: (() -> Void)?

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
                activeActions: activeActions,
                lastError: lastError,
                isValidatingAction: isValidatingAction,
                onGeneratedFileTap: onGeneratedFileTap,
                onCitationTap: onCitationTap,
                onValidateAction: onValidateAction,
                onRetry: onRetry,
                onOpenInBrowser: onOpenInBrowser
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
    var lastError: ErrorInfo?
    var isValidatingAction: Bool = false
    var onGeneratedFileTap: ((GeneratedFile) -> Void)?
    var onCitationTap: ((CitationReference) -> Void)?
    var onValidateAction: ((ActionApproval) -> Void)?
    var onRetry: ((String) -> Void)?
    var onOpenInBrowser: (() -> Void)?

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

            if let content = message.content, !content.isEmpty {
                StreamingMarkdownView(rawContent: content, isStreaming: message.isStreaming)
                    .textSelection(!message.isStreaming)
            }

            if !message.isStreaming,
               let files = message.generatedFiles?.filter(\.isVisible), !files.isEmpty
            {
                GeneratedFilesList(files: files, onTap: onGeneratedFileTap)
            }

            if !message.isStreaming,
               let citations = message.citations, !citations.isEmpty,
               let content = message.content
            {
                let mapping = processCiteDirectives(content).mapping
                if !mapping.isEmpty {
                    CitationsSection(mapping: mapping, citations: citations, onTap: onCitationTap)
                }
            }

            if message.isStreaming {
                switch streamingPhase {
                case let .approvalRequired(approval):
                    ToolApprovalInlineView(
                        approval: approval,
                        isLoading: isValidatingAction,
                        onValidate: onValidateAction
                    )
                case let .personalAuthRequired(provider, _):
                    AuthRequiredView(
                        label: "Authentication required for \(provider)",
                        onOpenInBrowser: onOpenInBrowser
                    )
                case let .fileAuthRequired(fileName, _):
                    AuthRequiredView(
                        label: "File access required for \(fileName)",
                        onOpenInBrowser: onOpenInBrowser
                    )
                case .idle, .thinking, .generating:
                    EmptyView()
                }
            }

            if message.status == .failed, let error = lastError {
                ErrorCardView(error: error, onRetry: { onRetry?(message.sId) })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
    }
}

// MARK: - Shared File Chip

struct FileChip: View {
    let title: String
    let contentType: String
    let isTappable: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: Attachment.sfSymbol(for: contentType))
                    .font(.system(size: 13))
                    .foregroundStyle(Color.highlight)

                Text(title)
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

// MARK: - Content Fragments

struct ContentFragmentList: View {
    let fragments: [ContentFragment]
    var onTap: ((ContentFragment) -> Void)?

    var body: some View {
        FlowLayout(spacing: 4) {
            ForEach(fragments) { fragment in
                FileChip(
                    title: fragment.title,
                    contentType: fragment.contentType,
                    isTappable: fragment.fileId != nil && onTap != nil,
                    onTap: { onTap?(fragment) }
                )
            }
        }
    }
}

// MARK: - Generated Files

struct GeneratedFilesList: View {
    let files: [GeneratedFile]
    var onTap: ((GeneratedFile) -> Void)?

    var body: some View {
        FlowLayout(spacing: 4, alignment: .leading) {
            ForEach(files) { file in
                FileChip(
                    title: file.title,
                    contentType: file.contentType,
                    isTappable: onTap != nil,
                    onTap: { onTap?(file) }
                )
            }
        }
    }
}

// MARK: - Citations

private struct CitationsSection: View {
    let mapping: [CiteEntry]
    let citations: [String: CitationReference]
    var onTap: ((CitationReference) -> Void)?

    @State private var isExpanded = false

    var body: some View {
        let active = mapping.compactMap { entry in
            citations[entry.ref].map { CitationCard.Entry(ref: entry.ref, citation: $0) }
        }
        if !active.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
                } label: {
                    HStack(spacing: 6) {
                        Text("\(active.count) sources")
                            .sparkleCopyXs()
                            .foregroundStyle(Color.dustFaint)

                        (isExpanded ? SparkleIcon.chevronUp : SparkleIcon.chevronDown).image
                            .resizable()
                            .scaledToFit()
                            .frame(width: 10, height: 10)
                            .foregroundStyle(Color.dustFaint)
                    }
                }
                .buttonStyle(.plain)

                if isExpanded {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(active) { entry in
                            CitationCard(entry: entry, onTap: onTap)
                        }
                    }
                    .padding(.top, 6)
                    .transition(.opacity)
                }
            }
        }
    }
}

struct CitationCard: View {
    struct Entry: Identifiable {
        let ref: String
        let citation: CitationReference
        var id: String { ref }
    }

    let entry: Entry
    var onTap: ((CitationReference) -> Void)?

    private var hasTapTarget: Bool {
        entry.citation.href != nil && onTap != nil
    }

    var body: some View {
        Button {
            onTap?(entry.citation)
        } label: {
            HStack(spacing: 8) {
                providerIcon
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 16)

                Text(entry.citation.title)
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustForeground)
                    .lineLimit(1)

                Spacer()

                if entry.citation.href != nil {
                    SparkleIcon.externalLink.image
                        .resizable()
                        .scaledToFit()
                        .frame(width: 12, height: 12)
                        .foregroundStyle(Color.dustFaint)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.dustMutedBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .disabled(!hasTapTarget)
    }

    private var providerIcon: Image {
        if let sparkleIcon = MCPServerIcon.icon(for: entry.citation.provider) {
            return sparkleIcon.image
        }
        return Image(systemName: Attachment.sfSymbol(for: entry.citation.contentType))
    }
}

// swiftlint:disable identifier_name
private struct FlowLayout: Layout {
    var spacing: CGFloat = 4
    var alignment: HorizontalAlignment = .trailing

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
            if alignment == .leading {
                var x = bounds.minX
                for index in row {
                    let size = cache.sizes[index]
                    subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                    x += size.width + spacing
                }
            } else {
                var x = bounds.maxX
                for index in row.reversed() {
                    let size = cache.sizes[index]
                    x -= size.width
                    subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                    x -= spacing
                }
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

// MARK: - Streaming Status (thinking / acting / generating)

struct StreamingStatusView: View {
    let phase: AgentStreamingPhase
    let activeActions: [ActiveAction]
    let chainOfThought: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let text = chainOfThought, !text.isEmpty {
                Text(text)
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustFaint)
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if !activeActions.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(activeActions) { action in
                        ActionRow(action: action)
                    }
                }
                .padding(.top, chainOfThought?.isEmpty == false ? 6 : 0)
            } else if !isBlockingPhase {
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

    private var isBlockingPhase: Bool {
        switch phase {
        case .personalAuthRequired, .fileAuthRequired, .approvalRequired: true
        default: false
        }
    }
}

// MARK: - Tool Approval

struct ToolApprovalInlineView: View {
    let approval: ToolApprovalInfo
    var isLoading: Bool = false
    var onValidate: ((ActionApproval) -> Void)?

    @State private var showDetails = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                guard !approval.displayableInputs.isEmpty else { return }
                withAnimation(.easeInOut(duration: 0.2)) { showDetails.toggle() }
            } label: {
                HStack(spacing: 8) {
                    ToolApprovalIconView(serverName: approval.mcpServerName)
                        .frame(width: 20, height: 20)

                    Text(title)
                        .sparkleLabelSm()
                        .foregroundStyle(Color.dustForeground)

                    if !approval.displayableInputs.isEmpty {
                        Spacer()
                        (showDetails ? SparkleIcon.chevronUp : SparkleIcon.chevronDown).image
                            .resizable()
                            .scaledToFit()
                            .frame(width: 10, height: 10)
                            .foregroundStyle(Color.dustFaint)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if showDetails {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(approval.displayableInputs, id: \.key) { input in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(input.key)
                                .sparkleLabelXs()
                                .foregroundStyle(Color.dustFaint)
                            Text(input.value)
                                .sparkleCopyXs()
                                .foregroundStyle(Color.dustForeground)
                                .lineLimit(6)
                        }
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.dustMutedBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            Divider()
                .foregroundStyle(Color.dustBorder)

            ToolApprovalActionButtons(
                canAlwaysAllow: approval.canAlwaysAllow,
                isLoading: isLoading,
                onValidate: onValidate
            )
        }
        .padding(12)
        .liquidGlassRoundedRect()
    }

    private var title: String {
        let server = approval.mcpServerName ?? "Tool"
        if let tool = approval.toolName {
            return "Allow \(server) to \(tool)?"
        }
        return "\(server) requires approval"
    }
}

struct ToolApprovalIconView: View {
    let serverName: String?

    var body: some View {
        if let name = serverName, let icon = MCPServerIcon.icon(for: name) {
            icon.image
                .resizable()
                .scaledToFit()
        } else {
            SparkleIcon.cog6Tooth.image
                .resizable()
                .scaledToFit()
                .foregroundStyle(Color.dustFaint)
        }
    }
}

struct ToolApprovalActionButtons: View {
    var canAlwaysAllow: Bool = false
    var isLoading: Bool = false
    var onValidate: ((ActionApproval) -> Void)?

    var body: some View {
        VStack(spacing: 8) {
            if canAlwaysAllow {
                Button { onValidate?(.alwaysApproved) } label: {
                    Text("Always allow")
                        .sparkleLabelXs()
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.highlight)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }

            Button { onValidate?(.approved) } label: {
                Text(canAlwaysAllow ? "Allow once" : "Allow")
                    .sparkleLabelXs()
                    .foregroundStyle(canAlwaysAllow ? Color.dustForeground : .white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(canAlwaysAllow ? Color.clear : Color.highlight)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Button { onValidate?(.rejected) } label: {
                Text("Decline")
                    .sparkleLabelXs()
                    .foregroundStyle(Color.dustForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
        }
        .disabled(isLoading)
        .opacity(isLoading ? 0.5 : 1.0)
    }
}

// MARK: - Auth / File Access Required

struct AuthRequiredView: View {
    let label: String
    var onOpenInBrowser: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                SparkleIcon.lock.image
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 16)
                    .foregroundStyle(Color.dustFaint)

                Text(label)
                    .sparkleLabelSm()
                    .foregroundStyle(Color.dustForeground)
            }

            Text("Connect this service in the web app to continue.")
                .sparkleCopyXs()
                .foregroundStyle(Color.dustFaint)

            if let onOpenInBrowser {
                Button(action: onOpenInBrowser) {
                    HStack(spacing: 4) {
                        SparkleIcon.externalLink.image
                            .resizable()
                            .scaledToFit()
                            .frame(width: 12, height: 12)
                        Text("Open in Dust")
                            .sparkleLabelXs()
                    }
                    .foregroundStyle(Color.dustForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
                .liquidGlassRoundedRect(cornerRadius: 10)
            }
        }
        .padding(12)
        .liquidGlassRoundedRect()
    }
}

// MARK: - Error Card

struct ErrorCardView: View {
    let error: ErrorInfo
    var onRetry: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                SparkleIcon.exclamationCircle.image
                    .resizable()
                    .scaledToFit()
                    .frame(width: 14, height: 14)
                    .foregroundStyle(Color.warning)

                Text(error.errorTitle ?? "Something went wrong")
                    .sparkleLabelSm()
                    .foregroundStyle(Color.warning)
            }

            Text(error.message)
                .sparkleCopyXs()
                .foregroundStyle(Color.dustForeground)

            if error.isRetryable, let onRetry {
                Button(action: onRetry) {
                    HStack(spacing: 4) {
                        SparkleIcon.arrowPath.image
                            .resizable()
                            .scaledToFit()
                            .frame(width: 12, height: 12)
                        Text("Retry")
                            .sparkleLabelXs()
                    }
                    .foregroundStyle(Color.highlight)
                }
            }
        }
        .padding(12)
        .liquidGlassRoundedRect()
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
