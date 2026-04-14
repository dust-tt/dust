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
            if !viewModel.selectedCapabilities.isEmpty || !viewModel.selectedKnowledgeItems.isEmpty {
                selectionChipsBar
            }

            if !viewModel.attachments.isEmpty {
                attachmentPreviewBar
            }

            if viewModel.speechService.isRecording {
                recordingView
            } else if viewModel.speechService.isTranscribing {
                transcribingView
            } else {
                textFieldView
            }

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

    // MARK: - Recording View

    private var recordingView: some View {
        HStack(spacing: 12) {
            AudioWaveView(level: viewModel.speechService.audioLevel)
                .frame(maxWidth: .infinity)

            Button {
                viewModel.cancelVoiceInput()
            } label: {
                SparkleIcon.xMark.image
                    .resizable()
                    .frame(width: 12, height: 12)
                    .foregroundStyle(Color.dustForeground.opacity(0.5))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 44)
    }

    // MARK: - Transcribing View

    private var transcribingView: some View {
        HStack(spacing: 8) {
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(0.8)
                .tint(Color.highlight)
            Text("Transcribing...")
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground.opacity(0.5))
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 44)
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
        .disabled(viewModel.speechService.isRecording || viewModel.speechService.isTranscribing)
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
        .disabled(viewModel.speechService.isRecording || viewModel.speechService.isTranscribing || viewModel.isSending)
    }

    // MARK: - Action Button (Send, Mic, or Stop)

    @ViewBuilder
    private var actionButton: some View {
        if viewModel.speechService.isRecording {
            stopButton
        } else if viewModel.speechService.isTranscribing {
            // No action button while transcribing
            EmptyView()
        } else if viewModel.canSend {
            sendButton
        } else {
            micButton
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
            viewModel.startVoiceInput()
        } label: {
            SparkleIcon.mic.image
                .resizable()
                .frame(width: 14, height: 14)
                .foregroundStyle(Color.dustForeground)
                .padding(11)
        }
        .liquidGlassCircle()
    }

    // MARK: - Stop Button

    private var stopButton: some View {
        Button {
            viewModel.stopVoiceInput()
        } label: {
            Circle()
                .fill(Color.highlight)
                .frame(width: 36, height: 36)
                .overlay {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(.white)
                        .frame(width: 12, height: 12)
                }
        }
    }
}

// MARK: - Audio Wave Visualization

private struct AudioWaveView: View {
    let level: Float

    @State private var phase: Double = 0
    private let barCount = 24
    private let barSpacing: CGFloat = 3

    var body: some View {
        HStack(spacing: barSpacing) {
            ForEach(0 ..< barCount, id: \.self) { index in
                let position = Double(index) / Double(barCount - 1)
                let distanceFromCenter = abs(position - 0.5)
                let envelope = 1.0 - distanceFromCenter * 1.4
                let wave = sin(position * .pi * 3 + phase)
                let amplitude = Double(max(level, 0.05))
                let height = max((0.15 + envelope * amplitude * (0.5 + wave * 0.5)) * 24, 3)

                RoundedRectangle(cornerRadius: 1.5)
                    .fill(Color.highlight)
                    .frame(width: 2, height: height)
            }
        }
        .frame(height: 24)
        .animation(.easeOut(duration: 0.12), value: level)
        .onAppear {
            withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                phase = .pi * 2
            }
        }
    }
}
