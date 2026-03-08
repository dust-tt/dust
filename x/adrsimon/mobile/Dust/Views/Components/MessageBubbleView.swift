import MarkdownUI
import SparkleTokens
import SwiftUI

struct MessageBubbleView: View {
    let message: ConversationMessage
    let currentUserEmail: String

    var body: some View {
        switch message {
        case let .user(msg):
            if msg.context?.email == currentUserEmail {
                UserMessageBubble(message: msg)
            } else {
                OtherUserMessageBubble(message: msg)
            }
        case let .agent(msg):
            AgentMessageBubble(message: msg)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Avatar(url: message.configuration.pictureUrl)

                Text("@\(message.configuration.name)")
                    .sparkleLabelXs()
                    .foregroundStyle(Color.dustForeground)
            }

            if message.isStreaming {
                HStack(spacing: 4) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Thinking...")
                        .sparkleCopyXs()
                        .foregroundStyle(Color.dustFaint)
                }
                .padding(.leading, 4)
            } else if let content = message.content, !content.isEmpty {
                Markdown(preprocessDirectives(content))
                    .markdownTheme(.dust)
                    .lineSpacing(4)
                    .textSelection(.enabled)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
    }
}
