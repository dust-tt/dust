# Implementation Plan: Conversation Compaction

Five phases of bitesize PRs. Each PR should be small, reviewable, and independently deployable.

## Phase 1: Prelude (no behavior changes)

Foundational type and model changes. No runtime behavior changes — new type is inert everywhere.

### - [x] PR 1.1 — Add `CompactionMessageType` + type guard

Type-only change, no DB or runtime impact. Combined with PR 1.3 into a single PR (#24048).

- Add `CompactionMessageStatus = "created" | "succeeded" | "failed"` to
  `front/types/assistant/conversation.ts`.
- Add `CompactionMessageType` (with `type: "compaction_message"`, `status`, `content`) to
  `front/types/assistant/conversation.ts`.
- Add `isCompactionMessageType()` type guard.
- Add `CompactionMessageType` to the `MessageType` union (line 37), the `LegacyLightMessageType`
  union (line 43), and the `LightMessageType` union (line 49).
- Update `ConversationType.content` type (line 372) to include `CompactionMessageType[]`.

### - [x] PR 1.2 — Add `CompactionMessageModel` + migration

DB schema change, no runtime behavior. PR #24065.

- Add `CompactionMessageModel` in `front/lib/models/agent/conversation.ts` with fields: `status`,
  `content` (TEXT, nullable). Defined above `MessageModel` so the FK type is available.
- Migration 576: create `compaction_messages` table (with `workspaceId` index), add
  `compactionMessageId` FK + index on `messages` table.
- Update `MessageModel`: add `compactionMessageId` FK declaration.
- Update `MessageModel` validation hook: extend the exactly-one-FK-non-null check to include
  `compactionMessageId`.
- Add `compactionMessageId` index on `messages` table (following [BACK13]).
- Add associations: `CompactionMessageModel.hasOne(MessageModel)` /
  `MessageModel.belongsTo(CompactionMessageModel)`.
- Register in `admin/db.ts`.
- Handle `CompactionMessageModel` cleanup in `destroyConversation`.

### - [x] PR 1.3 — Handle `"compaction_message"` in all exhaustive switches

Combined with PR 1.1 into a single PR (#24048). All exhaustive switches handled. Compaction
messages are filtered out / no-op everywhere.

Remaining `TODO(compaction)` markers left for future PRs:
- `front/components/assistant/conversation/types.ts` — render compaction messages in UI instead of
  filtering (→ PR 5.2).
- `front/lib/api/assistant/conversation_rendering/message_rendering.ts` — render compaction as
  history boundary (→ PR 4.1).
- `front/lib/api/actions/servers/project_manager/tools/conversation_formatting.ts` — stop at
  compaction boundary (→ PR 4.1).
- `front/lib/api/v1/backward_compatibility.ts` — expose compaction messages in the public API
  (→ future, post-Phase 5).

---

## Phase 2: Token Consumption Evaluation

Surface the model's reported `promptTokens` so we can determine when to trigger compaction.
No new DB columns — token counts are resolved on-the-fly from existing run usage data.

### - [x] PR 2.1 — Add conversation context usage endpoint

PR #24086.

- Add `GET /api/w/[wId]/assistant/conversations/[cId]/context-usage` endpoint.
- `ConversationResource.getLatestCompletedAgentMessageRun()` — instance method that finds the last
  succeeded/gracefully-stopped agent message, takes its last `runId`, and returns a `RunResource`.
- `RunResource.fetchByDustRunId()` — fetch a run resource by its dustRunId.
- Endpoint calls `run.listRunUsages()`, takes max `promptTokens` across usages, resolves model
  config for `contextSize`.
- Returns `{ model: SupportedModel, contextUsage: number, contextSize: number }`.
- Frontend uses this for the context usage indicator (Phase 5).

---

## Phase 3: Compaction Method & Temporal Workflow

Build the compaction pipeline end-to-end. No feature flag needed — inert until Phase 5 provides a trigger.

### - [x] PR 3.1 — Add compaction Temporal workflow skeleton

PR #24104. Collocated with the agent loop on `agent-loop-queue-v2`.

- `compactionWorkflow` in `workflows.ts` — single-activity workflow.
- `compactionActivity` in `activities/compaction.ts` — thin wrapper, delegates to `runCompaction`.
- `runCompaction` in `temporal/agent_loop/lib/compaction.ts` — fetches conversation, finds the
  `CompactionMessageType` by sId+version, calls `updateCompactionMessageWithContentAndFinalStatus`
  (stub sets content to `[COMPACTION]`).
- `launchCompactionWorkflow` in `client.ts` — fire-and-forget, `DustError` on already-running.
- `updateCompactionMessageWithContentAndFinalStatus` in `conversation.ts` — TODO: implement with
  proper locking.
- Activity registered in `worker.ts`.

### - [x] PR 3.2 — Add SSE events for compaction lifecycle

PR #24106. Type-only + event plumbing.

- `CompactionMessageNewEvent` and `CompactionMessageDoneEvent` in
  `front/types/assistant/conversation.ts` (conversation-level events, alongside
  `AgentMessageNewEvent`). Uses `_done` (not `_success`) to mirror `AgentMessageDoneEvent` —
  signals finalization regardless of outcome.
- Added to `ConversationEvents` union, `isMessageEventParams()` switch, and
  `isConversationEventAllowedForAuth`.
- `ConversationViewer`: no-op cases (TODO for UI in Phase 5).
- Public API v1: filtered out (not exposed).

### - [x] PR 3.3 — Implement `compaction` + block `postUserMessage`

PR #24107.

- `compactConversation()` in `conversation.ts`: acquires advisory lock, creates
  `CompactionMessageModel` + `MessageModel`, publishes `compaction_message_new`, launches
  `compactionWorkflow` fire-and-forget. Returns 409 if compaction already in progress.
- `updateCompactionMessageWithContentAndFinalStatus`: acquires advisory lock, looks up
  `CompactionMessageModel` via `MessageModel` join, updates status + content. The
  `compaction_message_done` event is emitted from `runCompaction` (PR 3.1).
- `postUserMessage` blocking: checks for active compaction (`status: "created"`) in conversation
  content, returns 409 if found.

### - [ ] PR 3.4 — Implement compaction summary generation

The LLM call that produces the summary.

- In `compactionActivity` (`front/temporal/agent_loop/activities/`):
  - Fetch all messages since the last succeeded `CompactionMessage` (or all messages if none).
  - Render them into a compaction prompt (adapt from Claude Code's approach — system prompt +
    conversation + "summarize" instruction, see `x/spolu/compaction/claude_compaction.md` for
    reference).
  - Call the LLM via `callModel` / `queryModelWithStreaming` to generate the summary.
  - Store the content on the `CompactionMessage`.
- Add the compaction prompt template (can live in the activity file or a dedicated prompt file
  under `front/temporal/agent_loop/`).

---

## Phase 4: Rendering & Pruning

Make compaction actually affect what the model sees.

### - [ ] PR 4.1 — Use compaction as history boundary in `renderConversationForModel`

- In `renderAllMessages()` (`front/lib/api/assistant/conversation_rendering/message_rendering.ts`):
  - Find the last `CompactionMessage` with `status: "succeeded"` in the conversation content.
  - Skip all messages before it.
  - Render the compaction summary as a system/user message (the history preamble).
  - Render all messages after it normally.
- Update `renderConversationForModel` (`conversation_rendering/index.ts`) to account for the
  compaction boundary when computing token budgets.

### - [ ] PR 4.2 — Update interactions and pruning for compacted conversations

- In `groupMessagesIntoInteractions` (`front/lib/api/assistant/conversation/interactions.ts`):
  a compaction message starts a new "era" — interactions before it are not grouped.
- In `prunePreviousInteractions`: only prune interactions after the compaction boundary (everything
  before is already hidden by the compaction).
- Add tests in `interactions.test.ts`.

---

## Phase 5: Client-Side & Triggering (pending design)

### - [ ] PR 5.1 — Context usage indicator in conversation UI

- Use the context-usage endpoint (from PR 2.2) to get `promptTokens` and `modelContextWindow`,
  compute usage percentage on the client.
- Display a progress bar or indicator showing context fullness.
- Show a warning when approaching the compaction threshold.

### - [ ] PR 5.2 — Compaction message rendering in conversation UI

- Render `CompactionMessage` as a lightweight separator/divider in the conversation view.
- Show "Earlier messages were summarized" with an expandable summary.
- Show a loading indicator while `status === "created"`.
- Disable input bar while compaction is in progress (mirror the pending steering UX).

### - [ ] PR 5.3 — Manual compaction trigger

- Add a UI affordance (button in the context usage indicator, or a `/compact` command) that calls
  `compaction`.
- Initially, compaction is user-triggered only — block the input bar once context usage reaches a
  high threshold, prompting the user to compact.
- API endpoint: `POST /api/w/[wId]/assistant/conversations/[cId]/compact`.

### Future: Automatic compaction trigger from agent loop finalization

- In `finalizeSuccessfulAgentLoopActivity` / `finalizeGracefullyStoppedAgentLoopActivity`: after
  storing `promptTokens`, check against `compactionThreshold`. If exceeded, call
  `launchCompactConversationWorkflow`.
- Requires careful handling of the steering interaction (see "Interaction with Steering" in the
  proposal): steering goes first, compaction runs after. Pruning remains as safety net.
