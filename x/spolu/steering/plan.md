# Implementation Plan: Steering

Three phases of bitesize PRs. Each PR should be small, reviewable, and independently deployable.

## Phase 1: Prelude (no behavior changes)

Foundational refactors that don't change any user-facing behavior.

### - [x] PR 1.1 — Add `updateAgentMessageWithFinalStatus` in `conversation.ts`

Move all agent message terminal status updates behind the conversation advisory lock.

- Add `updateAgentMessageWithFinalStatus()` to `front/lib/api/assistant/conversation.ts` that:
  - Takes `status: "succeeded" | "cancelled" | "failed"` and optional `error`
  - Acquires `getConversationRankVersionLock`
  - Updates `AgentMessageModel.status` + `completedAt` (+ error fields if applicable)
  - Returns `{ completedTs, status }`
- Update `updateAgentMessageDBAndMemory` in `common.ts` to delegate to `updateAgentMessageWithFinalStatus`
  for `"status"` and `"error"` update types via discriminated union (conversation required at
  compile time for terminal updates only).
- In-memory `agentMessage` mutation stays in `common.ts` (caller side).

---

## Phase 2: Graceful Stop

Implement the graceful stop mechanism end-to-end.

### - [x] PR 2.1 — Add `"gracefully_stopped"` to `AgentMessageStatus` + event types

- Add `"gracefully_stopped"` to `AgentMessageStatus` union and `AGENT_MESSAGE_STATUSES_TO_TRACK`.
- Add `AgentMessageGracefullyStoppedEvent` type (with `message` + `runIds` fields, matching
  `AgentMessageSuccessEvent` shape).
- Add `"agent_message_gracefully_stopped"` to `TERMINAL_AGENT_MESSAGE_EVENT_TYPES` and
  `AgentMessageEvents` union.
- Handle `"gracefully_stopped"` in all exhaustive switches — treat like `"succeeded"`.
- Map to `"succeeded"` in public API backward compatibility layer.
- Frontend: use message status from event (no hardcoded override).

### - [x] PR 2.2+2.3 — Add `gracefullyStopAgentLoopSignal` + finalization

- Add `gracefullyStopAgentLoopSignal` in `signals.ts`.
- Add `gracefulStopRequested` flag + handler in `agentLoopWorkflow`, check at step boundary.
- Add `finalizeGracefulStop` in `common.ts` (emits `agent_message_gracefully_stopped`,
  no content parser flush needed since step completed normally).
- Add `finalizeGracefullyStoppedAgentLoopActivity` in `finalize.ts` (mirrors successful path).
- Route `gracefulStopRequested` in the workflow to the new finalization.
- Handle `agent_message_gracefully_stopped` in `processEventForDatabase`.

### - [x] PR 2.4+2.5 — Add `gracefullyStopAgentLoop` helper + expose on cancel endpoint

- Add `gracefullyStopAgentLoop()` in `front/lib/api/assistant/pubsub.ts` (mirrors
  `cancelMessageGenerationEvent` but sends `gracefullyStopAgentLoopSignal`).
- Extend private `/cancel` endpoint to accept `action: "cancel" | "gracefully_stop"`.
- When `action === "gracefully_stop"`, call `gracefullyStopAgentLoop()`.
- Public v1 API endpoint unchanged (no breaking change).

### - [x] PR 2.6 — Context pruning: preserve gracefully stopped chains as single interaction

- Update `groupMessagesIntoInteractions` in
  `front/lib/api/assistant/conversation/interactions.ts`:
  - Don't close interaction at agent→user boundary when the agent turn ended with
    `status === "gracefully_stopped"`.
- Add/update tests in `interactions.test.ts`.

==> We went with simply increasing PREVIOUS_INTERACTIONS_TO_PRESERVE to 3 for now

### - [ ] PR 2.7 — Add `GracefulStopRequestedEvent` (when needed for UI)

- Add `GracefulStopReason`, `GracefulStopRequestedEvent` types.
- Add to conversation or message events (TBD based on UI needs).
- Publish from `gracefullyStopAgentLoop()` before sending the Temporal signal.
- Handle in frontend to show "stopping..." state.

==> P1 compared to phase3

---

## Phase 3: Steering (behind `enable_steering` feature flag)

All steering behavior gated behind a feature flag. No UI work except pending message display.

### - [x] PR 3.1 — Add `"pending"` to `MessageVisibility` + `UserMessagePromotedEvent`

Type + DB schema change, no runtime behavior.

- Add `"pending"` to `MessageVisibility` type in `front/types/assistant/conversation.ts`.
- Add `"pending"` to `MessageModel.visibility` `isIn` validation.
- Migration: update CHECK constraint on `visibility`.
- Handle `"pending"` in all exhaustive switches — for now, treat pending messages as invisible
  (filter them out where `"visible"` messages are expected).
- Add `UserMessagePromotedEvent` type in `front/types/assistant/conversation.ts`.
- Add to `ConversationEvents` union in `front/lib/api/assistant/streaming/types.ts`.

### - [x] PR 3.2 — Pending path in `postUserMessage`

Behind `enable_steering` feature flag:

- Add constraints and routing logic in `postUserMessage`:
  - At most one agent mention per message (error if >1).
  - Cannot address a different agent than the running one (error).
  - Only user mentions + running agent → normal path.
  - API callers → always normal path.
- Pending path: create `UserMessage` + `MessageModel` with `visibility: "pending"`, create
  `MentionModel` rows, do NOT create `AgentMessage`.
- After commit: publish `UserMessageNewEvent` (pending), call `gracefullyStopAgentLoop()`
  with `reason: "steering"`.

### - [x] PR 3.3+3.4 — Promote pending messages in `updateAgentMessageWithFinalStatus`

Extend `updateAgentMessageWithFinalStatus()` in `conversation.ts` to promote pending messages
inside the same advisory-locked transaction when status is `"gracefully_stopped"` or
`"succeeded"` (safety net). The existing flow already handles setting the status and emitting
the terminal event — this adds the promotion logic:

- Inside the locked transaction: find pending messages, promote visibility to `"visible"`,
  create one `AgentMessage` + `MessageModel`.
- Return promoted messages + new agent message info to the caller.
- In `finalizeGracefullyStoppedAgentLoopActivity`: publish `UserMessagePromotedEvent` events,
  publish `AgentMessageNewEvent`, launch new agent loop.
- The `"succeeded"` path acts as safety net (graceful stop signal lost or arrived too late).

### - [ ] PR 3.5 — Frontend: pending message display with spinner

- In user message rendering component, when `visibility === "pending"`, render the message
  with a muted/greyed-out style and a spinner indicator.
- When `UserMessagePromotedEvent` is received, update the message visibility to `"visible"`
  (remove spinner, normal style).

### Future: `wasPending` flag + `<dust_system>` steering instruction

A `wasPending` boolean on `MessageModel` could be set when promoting pending messages to visible.
This would allow `renderUserMessage()` to append a steering instruction to `<dust_system>`:
"This message was sent by the user to steer your current work." Deferred for now.
