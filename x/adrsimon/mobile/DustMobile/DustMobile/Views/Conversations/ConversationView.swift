import SwiftUI

struct ConversationDetailView: View {
    let appState: AppState
    let conversationId: String

    @State private var viewModel: ConversationViewModel?
    @State private var inputVM: InputBarViewModel?
    @State private var agentPickerVM: AgentPickerViewModel?

    var body: some View {
        VStack(spacing: 0) {
            if let viewModel, let inputVM {
                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.flatMessages) { message in
                                messageView(for: message, viewModel: viewModel)
                                    .id(message.sId)
                            }

                            Color.clear
                                .frame(height: 1)
                                .id("bottom")
                        }
                        .padding()
                    }
                    .onChange(of: viewModel.flatMessages.count) { _, _ in
                        withAnimation {
                            proxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                }

                Divider()

                InputBarView(viewModel: inputVM, agentPickerVM: agentPickerVM) {
                    await sendMessage()
                }
            } else {
                LoadingView(message: "Loading...")
            }
        }
        .navigationTitle(viewModel?.conversation?.title ?? "Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if viewModel == nil {
                let vm = ConversationViewModel(appState: appState, conversationId: conversationId)
                viewModel = vm
                inputVM = InputBarViewModel(appState: appState)
                agentPickerVM = AgentPickerViewModel(appState: appState)
                await agentPickerVM?.loadAgents()
                await vm.loadConversation()
            }
        }
        .onDisappear {
            viewModel?.stopStreaming()
        }
    }

    @ViewBuilder
    private func messageView(for message: MessageUnion, viewModel: ConversationViewModel) -> some View {
        switch message {
        case .userMessage(let msg):
            UserMessageView(message: msg)

        case .agentMessage(let msg):
            if let state = viewModel.messageStates[msg.sId] {
                AgentMessageView(state: state)
            } else {
                AgentMessageView(state: AgentMessageState(message: msg))
            }

        case .contentFragment(let fragment):
            ContentFragmentView(fragment: fragment)
        }
    }

    private func sendMessage() async {
        guard let inputVM, let viewModel else { return }

        let content = inputVM.buildMessageContent()
        let mentions = inputVM.mentions
        let fragments = inputVM.attachments

        inputVM.reset()

        await viewModel.sendMessage(
            content: content,
            mentions: mentions,
            contentFragments: fragments
        )
    }
}

// MARK: - Content Fragment View

struct ContentFragmentView: View {
    let fragment: ContentFragmentType

    var body: some View {
        HStack {
            Image(systemName: iconName)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading) {
                Text(fragment.title)
                    .font(.caption.bold())
                if let snippet = fragment.snippet {
                    Text(snippet)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer()
        }
        .padding(10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var iconName: String {
        if fragment.contentType.hasPrefix("image/") { return "photo" }
        if fragment.contentType.contains("pdf") { return "doc.richtext" }
        return "doc"
    }
}
