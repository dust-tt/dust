import SparkleTokens
import SwiftUI

struct InputBarView: View {
    @ObservedObject var viewModel: InputBarViewModel
    var conversationId: String?
    var onConversationCreated: ((Conversation) -> Void)?
    var onMessageSent: (() -> Void)?

    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Text input area
            TextField("Ask anything or call an agent with @", text: $viewModel.messageText, axis: .vertical)
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(1 ... 6)
                .focused($isTextFieldFocused)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .onChange(of: viewModel.messageText) { _, newValue in
                    viewModel.handleTextChange(newValue)
                }

            // Bottom toolbar: agent button (left) + send button (right)
            HStack {
                agentButton

                Spacer()

                sendButton
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .padding(.top, 4)
        }
        .background(
            Color.dustBackground
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 20,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 20
                    )
                )
                .shadow(color: .black.opacity(0.1), radius: 8, y: -4)
        )
        .sheet(isPresented: $viewModel.showAgentPicker) {
            AgentPickerSheet(
                agents: viewModel.agents,
                onSelect: { agent in
                    viewModel.insertMention(agent)
                }
            )
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Agent Button

    private var agentButton: some View {
        Button {
            viewModel.showAgentPicker = true
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 14))
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(Color.dustForeground)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
    }

    // MARK: - Send Button

    private var sendButton: some View {
        Button {
            Task {
                isTextFieldFocused = false
                if let conversationId {
                    if await viewModel.sendReply(conversationId: conversationId) {
                        onMessageSent?()
                    }
                } else if let conversation = await viewModel.sendMessage() {
                    onConversationCreated?(conversation)
                }
            }
        } label: {
            Circle()
                .fill(canSend ? Color.highlight : Color.dustMutedBackground)
                .frame(width: 36, height: 36)
                .overlay {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(canSend ? .white : Color.dustFaint)
                }
        }
        .disabled(!canSend)
    }

    private var canSend: Bool {
        !viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !viewModel.isSending
    }
}
