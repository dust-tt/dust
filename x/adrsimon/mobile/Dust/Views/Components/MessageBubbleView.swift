import MarkdownUI
import SparkleTokens
import SwiftUI

struct MessageBubbleView: View {
    let message: ConversationMessage
    let currentUserEmail: String
    var streamingPhase: AgentStreamingPhase = .idle

    var body: some View {
        switch message {
        case let .user(msg):
            if msg.context?.email == currentUserEmail {
                UserMessageBubble(message: msg)
            } else {
                OtherUserMessageBubble(message: msg)
            }
        case let .agent(msg):
            AgentMessageBubble(message: msg, streamingPhase: streamingPhase)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Avatar(url: message.configuration.pictureUrl)

                Text("@\(message.configuration.name)")
                    .sparkleLabelXs()
                    .foregroundStyle(Color.dustForeground)
            }

            // Show chain of thought while streaming
            if message.isStreaming,
               let chainOfThought = message.chainOfThought,
               !chainOfThought.isEmpty
            {
                ThinkingBubble(text: chainOfThought)
            }

            // Activity chip for streaming state
            if message.isStreaming {
                ActivityChip(phase: streamingPhase)
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

// MARK: - Activity Chip

struct ActivityChip: View {
    let phase: AgentStreamingPhase

    var body: some View {
        if phase != .idle {
            HStack(spacing: 6) {
                icon

                Text(label)
                    .sparkleCopyXs()
                    .foregroundStyle(labelColor)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(backgroundColor)
            .clipShape(Capsule())
        }
    }

    @ViewBuilder
    private var icon: some View {
        if isBlockingState {
            sparkleIcon.image
                .resizable()
                .frame(width: 12, height: 12)
                .foregroundStyle(labelColor)
        } else {
            ProgressView()
                .scaleEffect(0.6)
        }
    }

    private var isBlockingState: Bool {
        switch phase {
        case .personalAuthRequired, .fileAuthRequired, .approvalRequired:
            true
        default:
            false
        }
    }

    private var sparkleIcon: SparkleIcon {
        switch phase {
        case .personalAuthRequired:
            .lock
        case .fileAuthRequired:
            .lock
        case .approvalRequired:
            .stopSign
        default:
            .arrowPath
        }
    }

    private var labelColor: Color {
        isBlockingState ? Color.warning600 : Color.dustFaint
    }

    private var backgroundColor: Color {
        isBlockingState ? Color.warning100 : Color.dustMutedBackground
    }

    private var label: String {
        switch phase {
        case .idle:
            ""
        case .thinking:
            "Thinking…"
        case let .acting(label):
            label
        case .generating:
            "Writing…"
        case let .personalAuthRequired(provider):
            "Authentication required (\(provider))"
        case let .fileAuthRequired(fileName):
            "File access required (\(fileName))"
        case .approvalRequired:
            "Approval required"
        }
    }
}

// MARK: - Thinking Bubble

struct ThinkingBubble: View {
    let text: String
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 4) {
                    SparkleIcon.brain.image
                        .resizable()
                        .frame(width: 11, height: 11)
                    Text("Thinking")
                        .sparkleCopyXs()
                    (isExpanded ? SparkleIcon.chevronUp : SparkleIcon.chevronDown).image
                        .resizable()
                        .frame(width: 9, height: 9)
                }
                .foregroundStyle(Color.dustFaint)
            }
            .buttonStyle(.plain)

            if isExpanded {
                Text(text)
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustFaint)
                    .lineSpacing(3)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color.dustFaint.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.leading, 4)
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
