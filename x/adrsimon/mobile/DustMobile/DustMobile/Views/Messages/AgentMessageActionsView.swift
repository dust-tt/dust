import SwiftUI

struct AgentMessageActionsView: View {
    var state: AgentMessageState
    @EnvironmentObject var appState: AppState
    @State private var feedbackSubmitted: String?
    @State private var showFeedbackInput = false
    @State private var feedbackContent = ""

    var body: some View {
        HStack(spacing: 12) {
            // Thumbs up
            Button {
                Task {
                    await submitFeedback("up")
                }
            } label: {
                Image(systemName: feedbackSubmitted == "up" ? "hand.thumbsup.fill" : "hand.thumbsup")
                    .font(.caption)
                    .foregroundStyle(feedbackSubmitted == "up" ? .green : .secondary)
            }
            .buttonStyle(.plain)
            .disabled(feedbackSubmitted != nil)

            // Thumbs down
            Button {
                showFeedbackInput = true
            } label: {
                Image(systemName: feedbackSubmitted == "down" ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                    .font(.caption)
                    .foregroundStyle(feedbackSubmitted == "down" ? .red : .secondary)
            }
            .buttonStyle(.plain)
            .disabled(feedbackSubmitted != nil)

            // Retry button (only for failed messages)
            if state.message.status == "failed" {
                Button {
                    // Retry handled by parent view
                } label: {
                    Label("Retry", systemImage: "arrow.clockwise")
                        .font(.caption)
                        .foregroundStyle(.blue)
                }
                .buttonStyle(.plain)
            }

            // Copy button
            if let content = state.message.content, !content.isEmpty {
                Button {
                    UIPasteboard.general.string = content
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $showFeedbackInput) {
            NavigationStack {
                VStack(spacing: 16) {
                    Text("What went wrong?")
                        .font(.headline)

                    TextEditor(text: $feedbackContent)
                        .frame(minHeight: 100)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.3))
                        )
                        .padding(.horizontal)

                    Button("Submit") {
                        Task {
                            await submitFeedback("down")
                            showFeedbackInput = false
                        }
                    }
                    .buttonStyle(.borderedProminent)

                    Spacer()
                }
                .padding()
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showFeedbackInput = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }

    private func submitFeedback(_ direction: String) async {
        feedbackSubmitted = direction
        // Actual API call would happen through the ConversationViewModel
    }
}
