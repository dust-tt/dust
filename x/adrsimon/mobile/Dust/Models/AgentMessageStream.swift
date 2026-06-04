import Foundation

/// Reduces an agent message's streaming events into its live state. Pure value type:
/// `apply` events, read `snapshot`. Blocked/approval/auth is owned by the ViewModel.
struct AgentMessageStream {
    enum Activity: Equatable {
        case thinking
        case generating
    }

    struct Snapshot: Equatable {
        let messageId: String
        var content: String = ""
        var chainOfThought: String?
        var activity: Activity = .thinking
        var activeActions: [ActiveAction] = []
        var completedSteps: [ActivityStep] = []
        var error: ErrorInfo?
        /// nil until a terminal event arrives.
        var status: AgentMessageStatus?
        var generatedFiles: [GeneratedFile]?
        var citations: [String: CitationReference]?

        var isFinished: Bool {
            status != nil
        }
    }

    private(set) var snapshot: Snapshot
    private var thinkingBuffer = ""
    private var stepCounter = 0

    init(messageId: String) {
        self.snapshot = Snapshot(messageId: messageId)
    }

    mutating func apply(_ event: StreamingEventData) {
        switch event {
        case let .generationTokens(tokens):
            applyTokens(tokens)

        case let .toolParams(params):
            flushThinkingBuffer()
            snapshot.chainOfThought = nil
            let action = ActiveAction(
                id: params.action.id,
                label: params.action.displayLabels?.running ?? params.action.toolName ?? "Working…",
                serverName: params.action.internalMCPServerName
            )
            if !snapshot.activeActions.contains(where: { $0.id == action.id }) {
                snapshot.activeActions.append(action)
            }

        case let .agentActionSuccess(event):
            let doneLabel = event.action.displayLabels?.done ?? event.action.toolName ?? "Tool"
            stepCounter += 1
            snapshot.completedSteps.append(.action(
                id: "action-\(stepCounter)",
                label: doneLabel,
                serverName: event.action.internalMCPServerName
            ))
            snapshot.activeActions.removeAll { $0.id == event.action.id }

        case let .agentMessageSuccess(success):
            finalize(status: .succeeded, from: success.message)

        case let .agentMessageGracefullyStopped(event):
            finalize(status: .gracefullyStopped, from: event.message)

        case let .agentError(event):
            snapshot.error = ErrorInfo(from: event.error, messageId: snapshot.messageId)
            finalize(status: .failed, from: nil)

        case let .toolError(event):
            snapshot.error = ErrorInfo(from: event.error, messageId: snapshot.messageId)
            finalize(status: .failed, from: nil)

        case let .agentGenerationCancelled(event):
            finalize(status: event.status == "interrupted" ? .interrupted : .cancelled, from: nil)

        // Handled by the ViewModel, or no activity meaning.
        case .toolPersonalAuthRequired, .toolFileAuthRequired, .toolApproveExecution,
             .toolAskUserQuestion, .toolNotification, .agentContextPruned, .endOfStream, .unknown:
            break
        }
    }

    private mutating func applyTokens(_ tokens: GenerationTokensEvent) {
        switch tokens.classification {
        case .tokens:
            snapshot.content += tokens.text
            snapshot.activity = .generating
        case .chainOfThought:
            snapshot.chainOfThought = (snapshot.chainOfThought ?? "") + tokens.text
            thinkingBuffer += tokens.text
            snapshot.activity = .thinking
        case .openingDelimiter, .closingDelimiter:
            break
        }
    }

    private mutating func finalize(status: AgentMessageStatus, from final: AgentMessage?) {
        flushThinkingBuffer()
        if let final {
            snapshot.content = final.content ?? snapshot.content
            snapshot.chainOfThought = final.chainOfThought
            snapshot.generatedFiles = final.generatedFiles
            snapshot.citations = final.citations
        }
        snapshot.status = status
        snapshot.activeActions = []
    }

    private mutating func flushThinkingBuffer() {
        let text = thinkingBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        stepCounter += 1
        snapshot.completedSteps.append(.thinking(id: "thinking-\(stepCounter)", content: text))
        thinkingBuffer = ""
    }
}
