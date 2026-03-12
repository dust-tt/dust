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

            // Bottom toolbar: agent button (left) + action button (right)
            HStack {
                agentButton

                Spacer()

                actionButton
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
        .fullScreenCover(isPresented: $viewModel.isVoiceMode) {
            VoiceOverlayView(
                speechService: viewModel.speechService,
                onStop: { viewModel.stopVoiceInput() },
                onCancel: { viewModel.cancelVoiceInput() },
                onSend: {
                    viewModel.stopVoiceInput()
                    Task {
                        if let conversationId {
                            if await viewModel.sendReply(conversationId: conversationId) {
                                onMessageSent?()
                            }
                        } else if let conversation = await viewModel.sendMessage() {
                            onConversationCreated?(conversation)
                        }
                    }
                }
            )
        }
    }

    // MARK: - Agent Button

    private var agentButton: some View {
        Button {
            viewModel.showAgentPicker = true
        } label: {
            HStack(spacing: 4) {
                SparkleIcon.robot.image
                    .resizable()
                    .frame(width: 14, height: 14)
                SparkleIcon.chevronDown.image
                    .resizable()
                    .frame(width: 10, height: 10)
            }
            .foregroundStyle(Color.dustForeground)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
    }

    // MARK: - Action Button (Send or Mic)

    @ViewBuilder
    private var actionButton: some View {
        if canSend {
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
            Circle()
                .fill(Color.dustMutedBackground)
                .frame(width: 36, height: 36)
                .overlay {
                    SparkleIcon.mic.image
                        .resizable()
                        .frame(width: 14, height: 14)
                        .foregroundStyle(Color.dustForeground)
                }
        }
    }

    private var canSend: Bool {
        !viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !viewModel.isSending
    }
}

// MARK: - Voice Overlay

private struct VoiceOverlayView: View {
    @ObservedObject var speechService: SpeechService
    let onStop: () -> Void
    let onCancel: () -> Void
    let onSend: () -> Void

    var body: some View {
        ZStack {
            Color.dustBackground
                .ignoresSafeArea()

            // Audio-reactive blue glow at the bottom
            VStack {
                Spacer()
                RadialGradient(
                    colors: [
                        Color.highlight.opacity(0.08 + pow(Double(speechService.audioLevel), 2) * 0.45),
                        Color.highlight.opacity(0),
                    ],
                    center: .bottom,
                    startRadius: 0,
                    endRadius: 250
                )
                .frame(height: 300)
                .animation(.easeOut(duration: 0.15), value: speechService.audioLevel)
            }
            .ignoresSafeArea()

            VStack {
                Spacer()

                // Live transcription
                ScrollView {
                    Text(speechService.transcribedText)
                        .sparkleCopyXl()
                        .foregroundStyle(Color.dustForeground)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 24)
                }

                Spacer()

                Text("Listening...")
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustForeground.opacity(0.5))
                    .padding(.bottom, 12)

                // Controls
                HStack(spacing: 8) {
                    Button {
                        onSend()
                    } label: {
                        Circle()
                            .fill(Color.dustBackground)
                            .frame(width: 48, height: 48)
                            .overlay {
                                SparkleIcon.arrowUp.image
                                    .resizable()
                                    .fontWeight(.bold)
                                    .frame(width: 16, height: 16)
                                    .foregroundStyle(Color.dustForeground)
                            }
                    }

                    Button {
                        onStop()
                    } label: {
                        Circle()
                            .fill(Color.highlight)
                            .frame(width: 56, height: 56)
                            .overlay {
                                SparkleIcon.actionMic.image
                                    .resizable()
                                    .frame(width: 22, height: 22)
                                    .foregroundStyle(.white)
                            }
                            .modifier(PulseAnimationModifier())
                    }

                    Button {
                        onCancel()
                    } label: {
                        Circle()
                            .fill(Color.dustBackground)
                            .frame(width: 48, height: 48)
                            .overlay {
                                SparkleIcon.xMark.image
                                    .resizable()
                                    .frame(width: 16, height: 16)
                                    .foregroundStyle(Color.dustForeground)
                            }
                    }
                }
                .padding(6)
                .background(
                    Capsule()
                        .fill(Color.dustMutedBackground)
                )
                .padding(.bottom, 48)
            }
        }
    }
}

// MARK: - Pulse Animation

private struct PulseAnimationModifier: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? 1.08 : 1.0)
            .opacity(isPulsing ? 0.85 : 1.0)
            .animation(
                .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear { isPulsing = true }
    }
}
