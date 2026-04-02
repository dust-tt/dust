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

### - [ ] PR 2.1 — Add `"gracefully_stopped"` to `AgentMessageStatus` + event types

- Add `"gracefully_stopped"` to `AgentMessageStatus` union in
  `front/types/assistant/conversation.ts`.
- Add to `AGENT_MESSAGE_STATUSES_TO_TRACK` if needed for analytics.
- Handle `"gracefully_stopped"` in all exhaustive switches (`assertNever` / `assertNeverAndIgnore`)
  — treat it like `"succeeded"` for now.
- Add `AgentMessageGracefullyStoppedEvent` type in `front/types/assistant/conversation.ts`.
- Add `"agent_message_gracefully_stopped"` to `TERMINAL_AGENT_MESSAGE_EVENT_TYPES` and
  `AgentMessageEvents` union in `front/lib/api/assistant/streaming/types.ts`.
- Handle in frontend event processing (`AgentMessage.tsx`) — treat like `succeeded` for now.
- Add `GracefulStopReason`, `GracefulStopRequestedEvent` types in
  `front/types/assistant/conversation.ts`.
- Add to `ConversationEvents` union in `front/lib/api/assistant/streaming/types.ts`.

### - [ ] PR 2.2 — Add `gracefullyStopAgentLoopSignal` + workflow handler

- Add signal definition in `front/temporal/agent_loop/signals.ts`.
- Add `gracefulStopRequested` flag + `setHandler` in `agentLoopWorkflow`
  (`front/temporal/agent_loop/workflows.ts`).
- Check `gracefulStopRequested` at step boundary (`if (!shouldContinue || gracefulStopRequested)`).
- No finalization yet — just break the loop. The existing `finalizeSuccessfulAgentLoopActivity`
  runs (status = `"succeeded"`). This is safe because no one sends the signal yet.

### - [ ] PR 2.3 — Add `finalizeGracefulStop` + `finalizeGracefullyStoppedAgentLoopActivity`

- Add `finalizeGracefulStop` in `front/temporal/agent_loop/activities/common.ts` (mirrors
  `finalizeCancellation` but sets `"gracefully_stopped"` + emits
  `agent_message_gracefully_stopped`).
- Add `finalizeGracefullyStoppedAgentLoopActivity` in
  `front/temporal/agent_loop/activities/finalize.ts` (mirrors
  `finalizeSuccessfulAgentLoopActivity`).
- Route `gracefulStopRequested` in the workflow to the new finalization path.

### - [ ] PR 2.4 — Add `gracefullyStopAgentLoop` helper + publish `GracefulStopRequestedEvent`

- Add `gracefullyStopAgentLoop()` in `front/lib/api/assistant/pubsub.ts`.
- Publishes `GracefulStopRequestedEvent` on the conversation SSE channel before sending the
  Temporal signal.
- Takes `reason: GracefulStopReason` parameter.

### - [ ] PR 2.5 — Rename `/cancel` endpoint to `/stop` with `reason`

- Rename `front/pages/api/w/[wId]/assistant/conversations/[cId]/cancel.ts` to `stop.ts`.
- Change body schema from `{ action: "cancel", messageIds }` to
  `{ reason: "cancel" | "gracefully_stop", messageIds }`.
- When `reason === "cancel"`, call `cancelMessageGenerationEvent()` (existing behavior).
- When `reason === "gracefully_stop"`, call `gracefullyStopAgentLoop()` with
  `reason: "user_requested"`.
- Keep the old `/cancel` endpoint as a redirect or alias for backward compatibility until
  all clients are updated.

### - [ ] PR 2.6 — Context pruning: preserve gracefully stopped chains as single interaction

- Update `groupMessagesIntoInteractions` in
  `front/lib/api/assistant/conversation/interactions.ts`:
  - Don't close interaction at agent→user boundary when the agent turn ended with
    `status === "gracefully_stopped"`.
- Add/update tests in `interactions.test.ts`.

---

## Phase 3: Steering (behind `enable_steering_behavior` feature flag)

All steering behavior gated behind a feature flag. No UI work except pending message display.

### - [ ] PR 3.1 — Add `"pending"` to `MessageVisibility` + `wasPending` column + `UserMessagePromotedEvent`

Type + DB schema change, no runtime behavior.

- Add `"pending"` to `MessageVisibility` type in `front/types/assistant/conversation.ts`.
- Add `"pending"` to `MessageModel.visibility` `isIn` validation.
- Add `wasPending: boolean` (default `false`) to `MessageModel`.
- Migration: update CHECK constraint on `visibility`, add `wasPending` column.
- Handle `"pending"` in all exhaustive switches — for now, treat pending messages as invisible
  (filter them out where `"visible"` messages are expected).
- Add `wasPending` to `UserMessageType`.
- Add `UserMessagePromotedEvent` type in `front/types/assistant/conversation.ts`.
- Add to `ConversationEvents` union in `front/lib/api/assistant/streaming/types.ts`.

### - [ ] PR 3.2 — Pending path in `postUserMessage`

Behind `enable_steering_behavior` feature flag:

- Add constraints and routing logic in `postUserMessage`:
  - At most one agent mention per message (error if >1).
  - Cannot address a different agent than the running one (error).
  - Only user mentions + running agent → normal path.
  - API callers → always normal path.
- Pending path: create `UserMessage` + `MessageModel` with `visibility: "pending"`, create
  `MentionModel` rows, do NOT create `AgentMessage`.
- After commit: publish `UserMessageNewEvent` (pending), call `gracefullyStopAgentLoop()`
  with `reason: "steering"`.

### - [ ] PR 3.3 — `finalizeGracefulStopAgentMessage`

- Add `finalizeGracefulStopAgentMessage()` in `front/lib/api/assistant/conversation.ts`:
  - Acquires conversation advisory lock.
  - Sets agent message status to `"gracefully_stopped"`.
  - Finds pending messages, promotes visibility to `"visible"`, sets `wasPending: true`.
  - Creates one `AgentMessage` + `MessageModel`.
- Update `finalizeGracefullyStoppedAgentLoopActivity` to call this function, publish
  `UserMessagePromotedEvent` events, publish `AgentMessageNewEvent`, launch new agent loop.

### - [ ] PR 3.4 — Safety net in `updateAgentMessageWithFinalStatus` for succeeded path

- Update `updateAgentMessageWithFinalStatus()` to check for orphaned pending messages when `status` is
  `"succeeded"` and promote them (same logic as `finalizeGracefulStopAgentMessage`).
- This handles the edge case where the graceful stop signal was lost or arrived after the loop
  already decided to exit naturally.

### - [ ] PR 3.5 — `<dust_system>` steering instruction in `renderUserMessage`

- In `renderUserMessage()` (`front/lib/api/assistant/conversation_rendering/helpers.ts`):
  - When `m.wasPending` is true, append to `additionalInstructions`:
    `"This message was sent by the user to steer your current work."`

### - [ ] PR 3.6 — Frontend: pending message display with spinner

- In user message rendering component, when `visibility === "pending"`, render the message
  with a muted/greyed-out style and a spinner indicator.
- When `UserMessagePromotedEvent` is received, update the message visibility to `"visible"`
  (remove spinner, normal style).
