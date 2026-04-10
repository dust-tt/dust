# Implementation Plan: Conversation Compaction

Five phases of bitesize PRs. Each PR should be small, reviewable, and independently deployable.

## Phase 1: Prelude (no behavior changes)

Foundational type and model changes. No runtime behavior changes — new type is inert everywhere.

### - [ ] PR 1.1 — Add `CompactionMessageType` + type guard

Type-only change, no DB or runtime impact.

- Add `CompactionMessageStatus = "created" | "succeeded" | "failed"` to
  `front/types/assistant/conversation.ts`.
- Add `CompactionMessageType` (with `type: "compaction_message"`, `status`, `summary`) to
  `front/types/assistant/conversation.ts`.
- Add `isCompactionMessageType()` type guard.
- Add `CompactionMessageType` to the `MessageType` union (line 37), the `LegacyLightMessageType`
  union (line 43), and the `LightMessageType` union (line 49).
- Update `ConversationType.content` type (line 372) to include `CompactionMessageType[]`.

### - [ ] PR 1.2 — Add `CompactionMessageModel` + migration

DB schema change, no runtime behavior.

- Add `CompactionMessageModel` in `front/lib/models/agent/conversation.ts` with fields: `status`,
  `summary` (TEXT, nullable).
- Migration: create `compaction_message` table, add `compactionMessageId` FK on `message` table.
- Update `MessageModel` (line 662): add `compactionMessageId` FK declaration.
- Update `MessageModel` validation hook (line 809): extend the exactly-one-FK-non-null check to
  include `compactionMessageId`.
- Add `compactionMessageId` index on `message` table (following [BACK13]).
- Add association: `CompactionMessageModel.hasOne(MessageModel)` /
  `MessageModel.belongsTo(CompactionMessageModel)`.

### - [ ] PR 1.3 — Handle `"compaction_message"` in all exhaustive switches

Make the codebase compile and pass with the new type. Compaction messages are filtered out / no-op
everywhere.

- `front/lib/api/assistant/conversation/fetch.ts` (`_getConversation`, line ~250): add
  `CompactionMessageModel` to the `MessageModel` eager include, render compaction messages into the
  conversation content array.
- `front/lib/api/assistant/messages.ts` (`batchRenderMessages`): add rendering path for compaction
  messages (trivial — just map model fields to type).
- `front/lib/api/assistant/conversation_rendering/message_rendering.ts` (`renderAllMessages`,
  line ~157): add `isCompactionMessageType` branch — skip for now (no rendering to model yet).
- `front/lib/api/assistant/conversation/interactions.ts` (`groupMessagesIntoInteractions`): treat
  compaction messages as interaction boundaries (or skip).
- `front/components/poke/pages/ConversationPage.tsx` (line ~612): add case for
  `"compaction_message"`.
- `front/lib/client/conversation/event_handlers.ts` (line ~21): add `isCompactionMessageType`
  branch (no-op).
- All other if/else chains on `isUserMessageType` / `isAgentMessageType` /
  `isContentFragmentType` — audit and add compaction handling (filter out or no-op).

---

## Phase 2: Token Consumption Evaluation

Surface the model's reported `promptTokens` so we can determine when to trigger compaction.

### - [ ] PR 2.1 — Read `promptTokens` in finalization and store on `AgentMessageModel`

- Add `promptTokens` column (INTEGER, nullable) to `AgentMessageModel`. Migration.
- In `finalizeSuccessfulAgentLoopActivity` and `finalizeGracefullyStoppedAgentLoopActivity`
  (`front/temporal/agent_loop/activities/finalize.ts`): after existing side-effects, resolve the
  last run's prompt tokens:
  - Use `agentLoopArgs.dustRunIds` (or fall back to `agentMessage.runIds`).
  - Call `RunResource.listByDustRunIds()` → take the last run (ordered by `createdAt`) →
    `listRunUsages()` → sum `promptTokens`.
  - Update `AgentMessageModel.promptTokens` with the value.
- This is read-only side-effect work — no behavior change.

### - [ ] PR 2.2 — Surface `promptTokens` on `AgentMessageType` and events

- Add `promptTokens: number | null` to `AgentMessageType` and `LightAgentMessageType` in
  `front/types/assistant/conversation.ts`.
- Include `promptTokens` in `batchRenderAgentMessages()` output
  (`front/lib/api/assistant/messages.ts`).
- Include `promptTokens` in `AgentMessageSuccessEvent` and
  `AgentMessageGracefullyStoppedEvent` payloads (`front/types/assistant/agent.ts`).
- Frontend can now read `agentMessage.promptTokens` for display (Phase 5).

---

## Phase 3: Compaction Method & Temporal Workflow

Build the compaction pipeline end-to-end, gated behind a feature flag.

### - [ ] PR 3.1 — Add compaction Temporal workflow skeleton

Infrastructure only — workflow, worker, client, config. No trigger yet.

- Create `front/temporal/compaction/` with:
  - `config.ts` — queue name (`compaction-queue`).
  - `workflows.ts` — `compactConversationWorkflow` that calls a single activity.
  - `activities.ts` — `compactConversationActivity` stub (reads messages, returns placeholder
    summary for now).
  - `client.ts` — `launchCompactConversationWorkflow()` following the mentions/credit_alerts
    pattern (deterministic workflow ID from conversationId, fire-and-forget, handle
    `WorkflowExecutionAlreadyStartedError`).
  - `worker.ts` — register on the `front` Temporal namespace.
- Add to `worker_registry.ts`.

### - [ ] PR 3.2 — Add SSE events for compaction lifecycle

Type-only + event plumbing.

- Add `CompactionMessageNewEvent` and `CompactionMessageDoneEvent` types in
  `front/types/assistant/conversation.ts` (mirror `AgentMessageNewEvent` / `AgentMessageDoneEvent`
  shape).
- Add both to `ConversationEvents` union in
  `front/lib/api/assistant/streaming/types.ts`.
- Add cases in `isMessageEventParams()` switch
  (`front/lib/api/assistant/streaming/events.ts`, line ~106).

### - [ ] PR 3.3 — Implement `compactConversation` + block `postUserMessage`

Core orchestration. No feature flag needed — compaction is inert until Phase 5 provides a trigger.

- Add `compactConversation()` in `front/lib/api/assistant/conversation.ts`:
  - Acquire `getConversationRankVersionLock`.
  - Create `CompactionMessage` with `status: "created"`, `summary: null`.
  - Publish `CompactionMessageNewEvent`.
  - Launch `compactConversationWorkflow` (fire-and-forget).
- In `postUserMessage` (line ~528): check for `CompactionMessageModel` with
  `status: "created"` in the conversation — return 409 if found (same pattern as steering's
  pending message check).
- In `compactConversationActivity`:
  - On success: update `CompactionMessage` to `status: "succeeded"` + `summary`.
  - On failure: update to `status: "failed"`.
  - Publish `CompactionMessageDoneEvent`.

### - [ ] PR 3.4 — Implement compaction summary generation

The LLM call that produces the summary.

- In `compactConversationActivity` (`front/temporal/compaction/activities.ts`):
  - Fetch all messages since the last succeeded `CompactionMessage` (or all messages if none).
  - Render them into a compaction prompt (adapt from Claude Code's approach — system prompt +
    conversation + "summarize" instruction, see `x/spolu/compaction/claude_compaction.md` for
    reference).
  - Call the LLM via `callModel` / `queryModelWithStreaming` to generate the summary.
  - Store the summary on the `CompactionMessage`.
- Add the compaction prompt template (can live in the activity file or a dedicated prompt file
  under `front/temporal/compaction/`).

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

- Use `agentMessage.promptTokens` (from PR 2.2) and the model's context window size to compute
  usage percentage on the client.
- Display a progress bar or indicator showing context fullness.
- Show a warning when approaching the compaction threshold.

### - [ ] PR 5.2 — Compaction message rendering in conversation UI

- Render `CompactionMessage` as a lightweight separator/divider in the conversation view.
- Show "Earlier messages were summarized" with an expandable summary.
- Show a loading indicator while `status === "created"`.
- Disable input bar while compaction is in progress (mirror the pending steering UX).

### - [ ] PR 5.3 — Manual compaction trigger

- Add a UI affordance (button in the context usage indicator, or a `/compact` command) that calls
  `compactConversation`.
- Initially, compaction is user-triggered only — block the input bar once context usage reaches a
  high threshold, prompting the user to compact.
- API endpoint: `POST /api/w/[wId]/assistant/conversations/[cId]/compact`.

### Future: Automatic compaction trigger from agent loop finalization

- In `finalizeSuccessfulAgentLoopActivity` / `finalizeGracefullyStoppedAgentLoopActivity`: after
  storing `promptTokens`, check against `compactionThreshold`. If exceeded, call
  `launchCompactConversationWorkflow`.
- Requires careful handling of the steering interaction (see "Interaction with Steering" in the
  proposal): steering goes first, compaction runs after. Pruning remains as safety net.
