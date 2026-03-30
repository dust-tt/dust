import MarkdownUI
import SparkleTokens
import SwiftUI

struct MessageBubbleView: View {
    let message: ConversationMessage
    let currentUserEmail: String
    var streamingPhase: AgentStreamingPhase = .idle
    var activeActions: [ActiveAction] = []

    var body: some View {
        switch message {
        case let .user(msg):
            if msg.context?.email == currentUserEmail {
                UserMessageBubble(message: msg)
            } else {
                OtherUserMessageBubble(message: msg)
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

    var body: some View {
        HStack {
            Spacer()

            Markdown(preprocessDirectives(message.content))
                .markdownTheme(.dust)
                .lineSpacing(4)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.dustMutedBackground)
                .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .padding(.top, 12)
    }
}

struct OtherUserMessageBubble: View {
    let message: UserMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Avatar(url: message.context?.profilePictureUrl)

                Text(message.context?.fullName ?? message.context?.username ?? "User")
                    .sparkleLabelXs()
                    .foregroundStyle(Color.dustForeground)
            }

            Markdown(preprocessDirectives(message.content))
                .markdownTheme(.dust)
                .lineSpacing(4)
                .textSelection(.enabled)
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
                Markdown(preprocessDirectives(content))
                    .markdownTheme(.dust)
                    .lineSpacing(4)
                    .textSelection(!message.isStreaming)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
    }
}

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
