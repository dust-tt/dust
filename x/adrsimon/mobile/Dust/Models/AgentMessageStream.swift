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
    private var lastGenerationTraceId: String?
    private var retryThinkingBuffer: String?
    private var stepCounter = 0
    private var currentStep: Int?
    private var loopStepByCompletedStepId: [String: Int] = [:]

    init(messageId: String) {
        self.snapshot = Snapshot(messageId: messageId)
    }

    mutating func apply(_ event: StreamingEventData) {
        switch event {
        case let .generationTokens(tokens):
            applyTokens(tokens)

        case let .toolParams(params):
            currentStep = params.step ?? currentStep
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
            applyActionSuccess(event)

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

    private mutating func applyActionSuccess(_ event: AgentActionSuccessEvent) {
        let stepId = "action-\(event.action.id)"
        if !snapshot.completedSteps.contains(where: { $0.id == stepId }) {
            let doneLabel = event.action.displayLabels?.done ?? event.action.toolName ?? "Tool"
            appendCompletedStep(
                .action(id: stepId, label: doneLabel, serverName: event.action.internalMCPServerName),
                loopStep: event.step ?? currentStep
            )
        }
        snapshot.activeActions.removeAll { $0.id == event.action.id }
    }

    private mutating func applyTokens(_ tokens: GenerationTokensEvent) {
        let traceChanged = didTraceChange(tokens.traceId)
        defer { currentStep = tokens.step ?? currentStep }

        switch tokens.classification {
        case .tokens:
            retryThinkingBuffer = nil
            if traceChanged {
                snapshot.content = ""
            }
            snapshot.content += tokens.text
            snapshot.activity = .generating
        case .chainOfThought:
            if traceChanged {
                snapshot.content = ""
                retryThinkingBuffer = ""
                if let step = tokens.step, step == currentStep {
                    dropCompletedSteps(ofLoopStep: step)
                }
            }

            if retryThinkingBuffer != nil {
                let retryThinkingBuffer = (retryThinkingBuffer ?? "") + tokens.text
                self.retryThinkingBuffer = retryThinkingBuffer

                if let chainOfThought = snapshot.chainOfThought,
                   chainOfThought.starts(with: retryThinkingBuffer)
                {
                    snapshot.activity = .thinking
                    return
                }

                snapshot.chainOfThought = retryThinkingBuffer
                thinkingBuffer = retryThinkingBuffer
                self.retryThinkingBuffer = nil
            } else {
                snapshot.chainOfThought = (snapshot.chainOfThought ?? "") + tokens.text
                thinkingBuffer += tokens.text
            }
            snapshot.activity = .thinking
        case .openingDelimiter, .closingDelimiter:
            break
        }
    }

    private mutating func didTraceChange(_ traceId: String?) -> Bool {
        // Compare against the previous generation trace, then record this one for the next token.
        guard let traceId else { return false }
        defer { lastGenerationTraceId = traceId }
        guard let lastGenerationTraceId else { return false }
        return traceId != lastGenerationTraceId
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
        appendCompletedStep(.thinking(id: "thinking-\(stepCounter)", content: text), loopStep: currentStep)
        thinkingBuffer = ""
        retryThinkingBuffer = nil
    }

    private mutating func appendCompletedStep(_ step: ActivityStep, loopStep: Int?) {
        snapshot.completedSteps.append(step)
        if let loopStep {
            loopStepByCompletedStepId[step.id] = loopStep
        }
    }

    /**
     * @cc [owner:adrsimon,label:product] retried-step-rebuilds
     * When a chain-of-thought event arrives with a new `traceId` for the agent-loop `step` already
     * in progress (a Temporal retry), the completed steps of that loop step MUST be dropped so the
     * retry rebuilds them instead of appending duplicates. Steps of other loop steps, and steps with
     * no known loop step, MUST be kept.
     */
    private mutating func dropCompletedSteps(ofLoopStep loopStep: Int) {
        snapshot.completedSteps.removeAll { loopStepByCompletedStepId[$0.id] == loopStep }
    }
}
