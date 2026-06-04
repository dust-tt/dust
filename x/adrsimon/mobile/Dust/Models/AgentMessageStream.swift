import Foundation

/// Reduces the streaming events of a single in-flight agent message into its live state.
///
/// Pure value type — feed events through `apply`, read `snapshot`. It holds no SwiftUI,
/// networking, or concurrency, so the reduction (token accumulation, thinking-buffer flush
/// ordering, action lifecycle, terminal status) is exercised by feeding events and asserting
/// the snapshot. Blocked/approval/auth is a separate concern owned by the ViewModel and is
/// intentionally ignored here.
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
        /// nil while in flight; set once a terminal event arrives.
        var status: AgentMessageStatus?
        /// Final files/citations, populated only on a successful/stopped finish.
        var generatedFiles: [GeneratedFile]?
        var citations: [String: CitationReference]?

        var isFinished: Bool {
            status != nil
        }
    }

    private(set) var snapshot: Snapshot
    /// Current thinking segment, flushed to a completed step on the next action or on finish.
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
            // The live thinking was flushed to a step; clear it off the message.
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

        // Owned by the ViewModel (blocked-state) or carry no activity meaning.
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
