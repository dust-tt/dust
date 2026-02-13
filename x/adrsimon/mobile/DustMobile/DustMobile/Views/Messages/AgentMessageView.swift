import SwiftUI
import MarkdownUI

struct AgentMessageView: View {
    var state: AgentMessageState

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            // Agent avatar
            AsyncImage(url: URL(string: state.message.configuration.pictureUrl)) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Circle()
                    .fill(Color.purple.opacity(0.2))
                    .overlay(
                        Text(String(state.message.configuration.name.prefix(1)).uppercased())
                            .font(.caption2.bold())
                            .foregroundStyle(.purple)
                    )
            }
            .frame(width: 28, height: 28)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 6) {
                // Agent name
                Text(state.message.configuration.name)
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)

                // Status indicator
                if state.agentState != .done {
                    AgentStatusIndicator(state: state.agentState, actions: state.message.actions)
                }

                // Chain of thought (collapsed)
                if let cot = state.message.chainOfThought, !cot.isEmpty {
                    DisclosureGroup {
                        Text(cot)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } label: {
                        Label("Thinking", systemImage: "brain")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Actions in progress
                if !state.message.actions.isEmpty && state.agentState == .acting {
                    ForEach(state.message.actions.filter { $0.status != "succeeded" }) { action in
                        ActionProgressView(action: action)
                    }
                }

                // Message content
                if let content = state.message.content, !content.isEmpty {
                    Markdown(content)
                        .markdownTextStyle {
                            FontSize(15)
                        }
                }

                // Error state
                if let error = state.message.error {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                        Text(error.message)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    .padding(8)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                // Actions bar (feedback, retry)
                if state.agentState == .done {
                    AgentMessageActionsView(state: state)
                }

                // Timestamp
                Text(Date(timeIntervalSince1970: TimeInterval(state.message.created / 1000)).formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 20)
        }
    }
}

// MARK: - Status Indicator

struct AgentStatusIndicator: View {
    let state: AgentStateClassification
    let actions: [AgentActionType]

    var body: some View {
        HStack(spacing: 6) {
            ProgressView()
                .scaleEffect(0.7)

            Text(statusText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private var statusText: String {
        switch state {
        case .thinking: return "Thinking..."
        case .acting:
            if let action = actions.last(where: { $0.status != "succeeded" }),
               let label = action.displayLabels?.running {
                return label
            }
            return "Using a tool..."
        case .writing: return "Writing..."
        case .done: return "Done"
        }
    }
}

// MARK: - Action Progress

struct ActionProgressView: View {
    let action: AgentActionType

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "wrench.and.screwdriver")
                .font(.caption)
                .foregroundStyle(.orange)

            Text(action.displayLabels?.running ?? action.functionCallName)
                .font(.caption)
                .foregroundStyle(.secondary)

            if action.status != "succeeded" {
                ProgressView()
                    .scaleEffect(0.6)
            }
        }
        .padding(6)
        .background(Color.orange.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}
