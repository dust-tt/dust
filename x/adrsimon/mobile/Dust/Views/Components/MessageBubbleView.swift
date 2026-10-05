// swiftlint:disable file_length
import MarkdownUI
import SparkleTokens
import SwiftUI

struct MessageBubbleView: View {
    let message: ConversationMessage
    let currentUserEmail: String
    var currentUserSId: String?
    var streamingPhase: AgentStreamingPhase = .idle
    var activeActions: [ActiveAction] = []
    var completedSteps: [ActivityStep] = []
    var lastError: ErrorInfo?
    var isValidatingAction: Bool = false
    var hideAgentHeader: Bool = false
    var onFragmentTap: ((ContentFragment) -> Void)?
    var onGeneratedFileTap: ((GeneratedFile) -> Void)?
    var onCitationTap: ((CitationReference) -> Void)?
    var onValidateAction: ((ActionApproval) -> Void)?
    var onAnswerQuestion: ((UserQuestionAnswer) -> Void)?
    var onRetry: ((String) -> Void)?
    var onOpenInBrowser: (() -> Void)?

    var body: some View {
        switch message {
        case let .user(msg):
            if msg.isWakeUp {
                WakeUpMarker(message: msg)
            } else if msg.isHidden {
                EmptyView()
            } else if msg.context?.email == currentUserEmail {
                UserMessageBubble(message: msg, onFragmentTap: onFragmentTap)
            } else {
                OtherUserMessageBubble(message: msg, onFragmentTap: onFragmentTap)
            }
        case let .agent(msg):
            AgentMessageBubble(
                message: msg,
                currentUserSId: currentUserSId,
                streamingPhase: streamingPhase,
                activeActions: activeActions,
                completedSteps: completedSteps,
                lastError: lastError,
                isValidatingAction: isValidatingAction,
                hideHeader: hideAgentHeader,
                onGeneratedFileTap: onGeneratedFileTap,
                onCitationTap: onCitationTap,
                onValidateAction: onValidateAction,
                onAnswerQuestion: onAnswerQuestion,
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
                    .inlineChips()
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.dustMutedBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.top, 12)
        .opacity(message.isPending ? 0.5 : 1.0)
    }
}

struct WakeUpMarker: View {
    let message: UserMessage

    private var label: String {
        message.isPending ? "Wake-up pending" : "Wake-up executed"
    }

    var body: some View {
        Text("\(label) · \(message.createdDate.formatted(date: .abbreviated, time: .shortened))")
            .sparkleCopyXs()
            .foregroundStyle(Color.dustFaint)
            .frame(maxWidth: .infinity)
            .padding(.top, 16)
    }
}

struct OtherUserMessageBubble: View {
    let message: UserMessage
    var onFragmentTap: ((ContentFragment) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Avatar(url: message.authorAvatarUrl)

                Text(message.authorName ?? "User")
                    .sparkleLabelXs()
                    .foregroundStyle(Color.dustForeground)
            }

            if let fragments = message.contentFragments, !fragments.isEmpty {
                ContentFragmentList(fragments: fragments, onTap: onFragmentTap)
            }

            if !message.content.isEmpty {
                Markdown(preprocessDirectives(message.content))
                    .markdownTheme(.dust)
                    .inlineChips()
                    .textSelection(.enabled)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
        .opacity(message.isPending ? 0.5 : 1.0)
    }
}

struct AgentMessageBubble: View {
    let message: AgentMessage
    var currentUserSId: String?
    var streamingPhase: AgentStreamingPhase = .idle
    var activeActions: [ActiveAction] = []
    var completedSteps: [ActivityStep] = []
    var lastError: ErrorInfo?
    var isValidatingAction: Bool = false
    var hideHeader: Bool = false
    var onGeneratedFileTap: ((GeneratedFile) -> Void)?
    var onCitationTap: ((CitationReference) -> Void)?
    var onValidateAction: ((ActionApproval) -> Void)?
    var onAnswerQuestion: ((UserQuestionAnswer) -> Void)?
    var onRetry: ((String) -> Void)?
    var onOpenInBrowser: (() -> Void)?

    // While streaming, directive parsing is throttled to avoid re-scanning the whole
    // message on every token (~30/sec → ~7/sec). Once finished, the content is stable
    // and we read a synchronously-memoized value so it's always in sync with the message.
    @State private var streamingRender: RenderedAgentMessage = .empty
    @State private var throttleTask: DispatchWorkItem?
    @State private var cache = RenderCache()

    private static let throttleIntervalSeconds: TimeInterval = 0.15
    private static let connectServiceDetail = "Connect this service in the web app to continue."

    private var rawContent: String {
        message.content ?? ""
    }

    private var rendered: RenderedAgentMessage {
        message.isStreaming ? streamingRender : cache.rendered(for: rawContent)
    }

    /// Falls back to the message's own error when there was no live `agent_error` event.
    private var effectiveError: ErrorInfo? {
        lastError ?? message.error.map { ErrorInfo(from: $0, messageId: message.sId) }
    }

    private var showsSuggestions: Bool {
        !message.isStreaming && !rendered.suggestionBatchIds.isEmpty
    }

    private var visibleFiles: [GeneratedFile] {
        message.isStreaming ? [] : message.generatedFiles?.filter(\.isVisible) ?? []
    }

    private var showsCitations: Bool {
        !message.isStreaming && message.citations?.isEmpty == false && !rendered.citeMapping.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !hideHeader {
                HStack(spacing: 8) {
                    Avatar(url: message.configuration.pictureUrl)

                    Text("@\(message.configuration.name)")
                        .sparkleLabelXs()
                        .foregroundStyle(Color.dustForeground)
                }
            }

            AgentActivityView(
                phase: streamingPhase,
                completedSteps: completedSteps,
                activeActions: activeActions,
                isStreaming: message.isStreaming,
                hasText: !rendered.displayMarkdown.isEmpty
            )

            if !rendered.displayMarkdown.isEmpty {
                Markdown(rendered.displayMarkdown)
                    .markdownTheme(.dust)
                    .inlineChips()
                    .textSelection(!message.isStreaming)
            }

            if showsSuggestions {
                OpenInDustCard(
                    icon: .stars02,
                    label: rendered.suggestionBatchIds.count == 1
                        ? "Suggested changes"
                        : "\(rendered.suggestionBatchIds.count) sets of suggested changes",
                    detail: "Review and apply them in the web app.",
                    onOpenInBrowser: onOpenInBrowser
                )
            }

            if !visibleFiles.isEmpty {
                GeneratedFilesList(files: visibleFiles, onTap: onGeneratedFileTap)
            }

            if showsCitations, let citations = message.citations {
                CitationsSection(mapping: rendered.citeMapping, citations: citations, onTap: onCitationTap)
            }

            if message.isStreaming {
                switch streamingPhase {
                case let .approvalRequired(approval):
                    ToolApprovalInlineView(
                        approval: approval,
                        isLoading: isValidatingAction,
                        canRespond: canRespondToBlockedAction(
                            triggeringUserId: approval.triggeringUserId,
                            currentUserSId: currentUserSId
                        ),
                        onValidate: onValidateAction
                    )
                case let .personalAuthRequired(provider, _):
                    OpenInDustCard(
                        icon: .lock01,
                        label: "Authentication required for \(provider)",
                        detail: Self.connectServiceDetail,
                        onOpenInBrowser: onOpenInBrowser
                    )
                case let .fileAuthRequired(fileName, _):
                    OpenInDustCard(
                        icon: .lock01,
                        label: "File access required for \(fileName)",
                        detail: Self.connectServiceDetail,
                        onOpenInBrowser: onOpenInBrowser
                    )
                case let .userQuestionRequired(info):
                    UserQuestionInlineView(
                        question: info.question,
                        isLoading: isValidatingAction,
                        canRespond: canRespondToBlockedAction(
                            triggeringUserId: info.triggeringUserId,
                            currentUserSId: currentUserSId
                        ),
                        onAnswer: onAnswerQuestion
                    )
                case .idle, .thinking, .generating:
                    EmptyView()
                }
            }

            if message.status == .failed, let error = effectiveError {
                ErrorCardView(error: error, onRetry: { onRetry?(message.sId) })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
        .onAppear {
            if message.isStreaming { streamingRender = RenderedAgentMessage(content: rawContent) }
        }
        .onChange(of: rawContent) { _, newValue in
            if message.isStreaming { scheduleUpdate(newValue) }
        }
    }

    private func scheduleUpdate(_ content: String) {
        throttleTask?.cancel()
        let work = DispatchWorkItem { streamingRender = RenderedAgentMessage(content: content) }
        throttleTask = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.throttleIntervalSeconds, execute: work)
    }
}

/// Memoizes the directive parse for a finished message so repeated SwiftUI body
/// evaluations (scrolling, sibling streaming) don't re-scan the whole content.
final private class RenderCache {
    private var content: String?
    private var value: RenderedAgentMessage = .empty

    func rendered(for content: String) -> RenderedAgentMessage {
        if self.content != content {
            self.content = content
            value = RenderedAgentMessage(content: content)
        }
        return value
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
                if Attachment.isImage(fragment.contentType), let fileId = fragment.fileId {
                    AttachmentImagePreview(
                        fileId: fileId,
                        title: fragment.title,
                        contentType: fragment.contentType,
                        isTappable: onTap != nil,
                        onTap: { onTap?(fragment) }
                    )
                } else {
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
}

// MARK: - Generated Files

struct GeneratedFilesList: View {
    let files: [GeneratedFile]
    var onTap: ((GeneratedFile) -> Void)?

    var body: some View {
        FlowLayout(spacing: 4, alignment: .leading) {
            ForEach(files) { file in
                if Attachment.isImage(file.contentType), let fileId = file.fileId {
                    AttachmentImagePreview(
                        fileId: fileId,
                        title: file.title,
                        contentType: file.contentType,
                        isTappable: onTap != nil,
                        onTap: { onTap?(file) }
                    )
                } else {
                    FileChip(
                        title: file.title,
                        contentType: file.contentType,
                        isTappable: file.fileId != nil && onTap != nil,
                        onTap: { onTap?(file) }
                    )
                }
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
        var id: String {
            ref
        }
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
                    SparkleIcon.linkExternal01.image
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

// MARK: - Tool Approval

struct ToolApprovalInlineView: View {
    let approval: ToolApprovalInfo
    var isLoading: Bool = false
    var canRespond: Bool = true
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

            if canRespond {
                ToolApprovalActionButtons(
                    canAlwaysAllow: approval.canAlwaysAllow,
                    isLoading: isLoading,
                    onValidate: onValidate
                )
            } else {
                BlockedWaitingView(label: "Waiting for a teammate to approve this.")
            }
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
            SparkleIcon.settings01.image
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

/// Shown in place of action buttons when the current user isn't the one whose turn
/// triggered the blocked action, so they can see what's pending without acting on it.
struct BlockedWaitingView: View {
    let label: String

    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.7)
            Text(label)
                .sparkleCopyXs()
                .foregroundStyle(Color.dustFaint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Open in Dust

struct OpenInDustCard: View {
    let icon: SparkleIcon
    let label: String
    let detail: String
    var onOpenInBrowser: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                icon.image
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 16)
                    .foregroundStyle(Color.dustFaint)

                Text(label)
                    .sparkleLabelSm()
                    .foregroundStyle(Color.dustForeground)
            }

            Text(detail)
                .sparkleCopyXs()
                .foregroundStyle(Color.dustFaint)

            if let onOpenInBrowser {
                Button(action: onOpenInBrowser) {
                    HStack(spacing: 4) {
                        SparkleIcon.linkExternal01.image
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

// MARK: - User Question

struct UserQuestionInlineView: View {
    let question: UserQuestion
    var isLoading: Bool = false
    var canRespond: Bool = true
    var onAnswer: ((UserQuestionAnswer) -> Void)?

    @State private var selectedOptions: Set<Int> = []
    @State private var customResponse = ""

    private var trimmedResponse: String {
        customResponse.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSend: Bool {
        !selectedOptions.isEmpty || !trimmedResponse.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(question.question)
                .sparkleLabelSm()
                .foregroundStyle(Color.dustForeground)
                .frame(maxWidth: .infinity, alignment: .leading)

            if canRespond {
                VStack(spacing: 6) {
                    ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                        optionRow(index: index, option: option)
                    }
                }

                TextField("Type something else", text: $customResponse, axis: .vertical)
                    .sparkleCopyXs()
                    .lineLimit(1 ... 4)
                    .padding(10)
                    .background(Color.dustMutedBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                Divider()
                    .foregroundStyle(Color.dustBorder)

                VStack(spacing: 8) {
                    Button { onAnswer?(buildAnswer()) } label: {
                        Text("Send")
                            .sparkleLabelXs()
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.highlight)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(!canSend)
                    .opacity(canSend ? 1.0 : 0.5)

                    Button { onAnswer?(UserQuestionAnswer(selectedOptions: [], customResponse: nil)) } label: {
                        Text("Skip")
                            .sparkleLabelXs()
                            .foregroundStyle(Color.dustForeground)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                }
                .disabled(isLoading)
                .opacity(isLoading ? 0.5 : 1.0)
            } else {
                BlockedWaitingView(label: "Waiting for a teammate to respond.")
            }
        }
        .padding(12)
        .liquidGlassRoundedRect()
    }

    private func optionRow(index: Int, option: UserQuestionOption) -> some View {
        let isSelected = selectedOptions.contains(index)
        return Button {
            toggle(index)
        } label: {
            HStack(alignment: .top, spacing: 8) {
                (isSelected ? SparkleIcon.checkCircle : SparkleIcon.circle).image
                    .resizable()
                    .scaledToFit()
                    .frame(width: 16, height: 16)
                    .foregroundStyle(isSelected ? Color.highlight : Color.dustFaint)

                VStack(alignment: .leading, spacing: 2) {
                    Text(option.label)
                        .sparkleLabelXs()
                        .foregroundStyle(Color.dustForeground)
                    if let description = option.description, !description.isEmpty {
                        Text(description)
                            .sparkleCopyXs()
                            .foregroundStyle(Color.dustFaint)
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.dustMutedBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? Color.highlight : Color.clear, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func toggle(_ index: Int) {
        if question.multiSelect {
            if selectedOptions.contains(index) {
                selectedOptions.remove(index)
            } else {
                selectedOptions.insert(index)
            }
        } else {
            selectedOptions = [index]
        }
    }

    private func buildAnswer() -> UserQuestionAnswer {
        UserQuestionAnswer(
            selectedOptions: selectedOptions.sorted(),
            customResponse: trimmedResponse.isEmpty ? nil : trimmedResponse
        )
    }
}

// MARK: - Error Card

struct ErrorCardView: View {
    let error: ErrorInfo
    var onRetry: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                SparkleIcon.alertCircle.image
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
                        SparkleIcon.refreshCw01.image
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
