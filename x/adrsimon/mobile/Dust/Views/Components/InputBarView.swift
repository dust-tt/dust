import SparkleTokens
import SwiftUI

struct InputBarView: View {
    @ObservedObject var viewModel: InputBarViewModel
    var conversationId: String?
    var autoFocus: Bool = false
    var onConversationCreated: ((Conversation) -> Void)?
    var onMessageSent: (() -> Void)?
    var onWillSendReply: ((String) -> Void)?
    var onReplySendFailed: (() -> Void)?

    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            if let error = viewModel.error {
                errorBanner(error)
            }

            if !viewModel.selectedCapabilities.isEmpty || !viewModel.selectedKnowledgeItems.isEmpty {
                selectionChipsBar
            }

            if !viewModel.attachments.isEmpty {
                attachmentPreviewBar
            }

            textFieldView

            HStack {
                agentButton

                attachmentButton

                Spacer()

                actionButton
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .padding(.top, 4)
        }
        .liquidGlassRoundedRect(cornerRadius: 24)
        .padding(.horizontal, 8)
        .padding(.bottom, 8)
        .sheet(isPresented: $viewModel.showAgentPicker) {
            AgentPickerSheet(
                agents: viewModel.agents,
                onSelect: { agent in
                    viewModel.selectAgent(agent)
                }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $viewModel.showPhotoPicker) {
            PhotoPickerView { results in
                viewModel.addPhotoResults(results)
                viewModel.showPhotoPicker = false
            }
        }
        .sheet(isPresented: $viewModel.showDocumentPicker) {
            DocumentPickerView { results in
                viewModel.addDocumentResults(results)
                viewModel.showDocumentPicker = false
            }
        }
        .sheet(isPresented: $viewModel.showCapabilitiesPicker) {
            CapabilitiesPickerSheet(
                capabilities: viewModel.availableCapabilities,
                selectedCapabilities: viewModel.selectedCapabilities,
                onSelect: { capability in
                    viewModel.selectCapability(capability, conversationId: conversationId)
                }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $viewModel.showKnowledgePicker) {
            KnowledgePickerSheet(
                workspaceId: viewModel.workspaceId,
                tokenProvider: viewModel.tokenProvider,
                selectedItems: viewModel.selectedKnowledgeItems,
                onSelect: { item in
                    viewModel.selectKnowledgeItem(item)
                }
            )
            .presentationDetents([.medium, .large])
        }
        .fullScreenCover(isPresented: $viewModel.showVoiceInput) {
            VoiceInputView(viewModel: viewModel) {
                viewModel.showVoiceInput = false
                sendAction()
            }
        }
        .task {
            // A task hop is needed; setting @FocusState in onAppear doesn't take.
            if autoFocus {
                isTextFieldFocused = true
            }
        }
    }

    // MARK: - Error Banner

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            SparkleIcon.exclamationCircle.image
                .resizable()
                .frame(width: 14, height: 14)
                .foregroundStyle(Color.warning)
            Text(message)
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(2)
            Spacer()
            Button {
                viewModel.error = nil
            } label: {
                SparkleIcon.xMark.image
                    .resizable()
                    .frame(width: 10, height: 10)
                    .foregroundStyle(Color.dustForeground.opacity(0.5))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Selection Chips

    private var selectionChipsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(viewModel.selectedCapabilities) { capability in
                    RemovableChipView(
                        icon: capability.icon,
                        iconColor: capability.isSkill ? Color.highlight : Color.dustForeground,
                        text: capability.displayName
                    ) {
                        viewModel.deselectCapability(capability, conversationId: conversationId)
                    }
                }
                ForEach(viewModel.selectedKnowledgeItems) { item in
                    RemovableChipView(
                        icon: item.icon,
                        iconColor: Color.dustForeground,
                        text: item.title
                    ) {
                        viewModel.deselectKnowledgeItem(item)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Attachment Preview

    private var attachmentPreviewBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(viewModel.attachments) { attachment in
                    AttachmentChipView(attachment: attachment) {
                        viewModel.removeAttachment(attachment)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Text Field

    private var textFieldView: some View {
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
    }

    // MARK: - Agent Button

    private var agentButton: some View {
        Button {
            viewModel.showAgentPicker = true
        } label: {
            HStack(spacing: 6) {
                if let agent = viewModel.selectedAgent {
                    Avatar(url: agent.pictureUrl, size: 18)
                    Text(agent.name)
                        .sparkleCopySm()
                        .lineLimit(1)
                } else {
                    SparkleIcon.robot.image
                        .resizable()
                        .frame(width: 14, height: 14)
                    Text("Agent")
                        .sparkleCopySm()
                }
                SparkleIcon.chevronDown.image
                    .resizable()
                    .frame(width: 10, height: 10)
            }
            .foregroundStyle(Color.dustForeground)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .liquidGlassCapsule()
    }

    // MARK: - Attachment Button

    private var attachmentButton: some View {
        Menu {
            Button {
                viewModel.showPhotoPicker = true
            } label: {
                Label("Photos", systemImage: "photo.on.rectangle")
            }
            Button {
                viewModel.showDocumentPicker = true
            } label: {
                Label("Files", systemImage: "folder")
            }
            Button {
                viewModel.showCapabilitiesPicker = true
            } label: {
                Label("Capabilities", systemImage: "bolt")
            }
            Button {
                viewModel.showKnowledgePicker = true
            } label: {
                Label("Knowledge", systemImage: "book")
            }
        } label: {
            SparkleIcon.plus.image
                .resizable()
                .frame(width: 14, height: 14)
                .foregroundStyle(Color.dustForeground)
                .padding(8)
        }
        .liquidGlassCircle()
        .disabled(viewModel.isSending)
    }

    // MARK: - Action Button (Send or Mic)

    @ViewBuilder
    private var actionButton: some View {
        if viewModel.canSend {
            sendButton
        } else {
            micButton
        }
    }

    // MARK: - Send

    /// Shared by the inline send button and the full-screen voice view's send control.
    private func sendAction() {
        // @MainActor so callbacks after the await (e.g. navigation) run on the main actor.
        Task { @MainActor in
            isTextFieldFocused = false
            if let conversationId {
                let pendingText = viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !pendingText.isEmpty {
                    onWillSendReply?(pendingText)
                }
                if await viewModel.sendReply(conversationId: conversationId) {
                    onMessageSent?()
                } else {
                    onReplySendFailed?()
                }
            } else if let conversation = await viewModel.sendMessage() {
                onConversationCreated?(conversation)
            }
        }
    }

    private var sendButton: some View {
        Button {
            sendAction()
        } label: {
            Circle()
                .fill(Color.highlight)
                .frame(width: 36, height: 36)
                .overlay {
                    SparkleIcon.arrowUp.image
                        .resizable()
                        .fontWeight(.bold)
                        .frame(width: 14, height: 14)
                        .foregroundStyle(.white)
                }
        }
    }

    // MARK: - Mic Button

    private var micButton: some View {
        Button {
            viewModel.presentVoiceInput()
        } label: {
            SparkleIcon.mic.image
                .resizable()
                .frame(width: 14, height: 14)
                .foregroundStyle(Color.dustForeground)
                .padding(11)
        }
        .liquidGlassCircle()
    }
}
