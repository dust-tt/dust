import MarkdownUI
import SparkleTokens
import SwiftUI

struct ConversationDetailView: View {
    let conversation: Conversation
    let currentUserEmail: String
    let onBack: () -> Void

    @StateObject private var viewModel: ConversationDetailViewModel

    init(
        conversation: Conversation,
        workspaceId: String,
        accessToken: String,
        currentUserEmail: String,
        onBack: @escaping () -> Void
    ) {
        self.conversation = conversation
        self.currentUserEmail = currentUserEmail
        self.onBack = onBack
        _viewModel = StateObject(
            wrappedValue: ConversationDetailViewModel(
                conversation: conversation,
                workspaceId: workspaceId,
                accessToken: accessToken
            )
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            messageList
        }
        .background(Color.dustBackground)
        .task {
            await viewModel.loadMessages()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.dustForeground)
            }

            Text(conversation.title ?? "New conversation")
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Message List

    private var messageList: some View {
        Group {
            switch viewModel.state {
            case .loading:
                VStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }

            case let .error(message):
                VStack {
                    Spacer()
                    Text(message)
                        .sparkleCopySm()
                        .foregroundStyle(Color.dustFaint)
                        .multilineTextAlignment(.center)
                        .padding()
                    Button("Retry") {
                        Task { await viewModel.loadMessages() }
                    }
                    Spacer()
                }

            case .loaded:
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            if viewModel.hasMore {
                                Button {
                                    Task { await viewModel.loadMore() }
                                } label: {
                                    Text("Load earlier messages")
                                        .sparkleCopyXs()
                                        .foregroundStyle(Color.dustFaint)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 12)
                                }
                            }

                            ForEach(viewModel.messages) { message in
                                MessageBubbleView(
                                    message: message,
                                    currentUserEmail: currentUserEmail
                                )
                                .id(message.id)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                    }
                    .onChange(of: viewModel.messages.last?.id) {
                        if let last = viewModel.messages.last {
                            withAnimation {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Message Bubble

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
                if let pictureUrl = message.context?.profilePictureUrl {
                    AsyncImage(url: URL(string: pictureUrl)) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Circle()
                            .fill(Color.dustFaint.opacity(0.3))
                    }
                    .frame(width: 24, height: 24)
                    .clipShape(Circle())
                } else {
                    Circle()
                        .fill(Color.dustFaint.opacity(0.3))
                        .frame(width: 24, height: 24)
                }

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
                AsyncImage(url: URL(string: message.configuration.pictureUrl)) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Circle()
                        .fill(Color.dustFaint.opacity(0.3))
                }
                .frame(width: 24, height: 24)
                .clipShape(Circle())

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

// MARK: - Directive Preprocessing

// Transforms Dust custom markdown directives into standard markdown
// before passing to MarkdownUI which only supports GFM.
// swiftlint:disable:next force_try
private let mentionRegex = try! NSRegularExpression(pattern: #":mention(?:_user)?\[([^\]]*)\]\{[^}]*\}"#)
// swiftlint:disable:next force_try
private let citeRegex = try! NSRegularExpression(pattern: #":cite\[([^\]]*)\]\{[^}]*\}"#)

private func preprocessDirectives(_ markdown: String) -> String {
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
