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
            if viewModel.speechService.isRecording {
                recordingView
            } else if viewModel.speechService.isTranscribing {
                transcribingView
            } else {
                textFieldView
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
        .disabled(viewModel.speechService.isRecording || viewModel.speechService.isTranscribing)
    }

    // MARK: - Action Button (Send, Mic, or Stop)

    @ViewBuilder
    private var actionButton: some View {
        if viewModel.speechService.isRecording {
            stopButton
        } else if viewModel.speechService.isTranscribing {
            // No action button while transcribing
            EmptyView()
        } else if canSend {
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

    private var canSend: Bool {
        !viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !viewModel.isSending
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
