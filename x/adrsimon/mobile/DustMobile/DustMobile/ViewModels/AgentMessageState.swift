import Foundation

/// Per-message state machine.
/// Port of extension/ui/components/agents/state/messageReducer.ts
@MainActor
@Observable
class AgentMessageState: Identifiable {
    @ObservationIgnored let messageId: String

    var message: AgentMessagePublicType
    var agentState: AgentStateClassification
    var isRetrying: Bool = false
    var lastUpdated = Date()

    nonisolated var id: String { messageId }

    init(message: AgentMessagePublicType) {
        self.messageId = message.sId
        self.message = message
        self.agentState = message.status == "succeeded" ? .done : .thinking
    }

    /// Apply an SSE event to update the message state.
    /// Port of messageReducer function.
    func apply(event: AgentMessageStreamEvent) {
        lastUpdated = Date()

        switch event {
        case .generationTokens(let e):
            switch e.classification {
            case "tokens":
                message.content = (message.content ?? "") + e.text
                agentState = .writing
            case "chain_of_thought":
                message.chainOfThought = (message.chainOfThought ?? "") + e.text
                agentState = .thinking
            case "opening_delimiter", "closing_delimiter":
                break
            default:
                break
            }

        case .agentActionSuccess(let e):
            // Replace or add action
            message.actions = message.actions.filter { $0.id != e.action.id } + [e.action]
            resetFailedStatus()

        case .toolParams(let e):
            message.actions = message.actions.filter { $0.id != e.action.id } + [e.action]
            resetFailedStatus()
            agentState = .acting

        case .agentMessageSuccess(let e):
            message = e.message
            agentState = .done

        case .agentError(let e):
            message.status = "failed"
            message.error = e.error
            agentState = .done

        case .toolError(let e):
            message.status = "failed"
            message.error = e.error
            agentState = .done

        case .agentGenerationCancelled:
            message.status = "cancelled"
            agentState = .done

        case .toolNotification:
            // Track tool progress (simplified - full implementation would track per-action)
            break

        case .done:
            if agentState != .done {
                agentState = .done
            }

        case .unknown:
            break
        }
    }

    private func resetFailedStatus() {
        if message.status == "failed" {
            message.status = "created"
            message.error = nil
        }
    }
}
