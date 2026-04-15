# Proposal: Conversation Compaction

## Context

@../steering/conversation_structure.md
@claude_compaction.md

## Problem

As conversations grow, the token count increases with each agent message. Eventually the context
becomes too large for the model to process efficiently, leading to degraded quality, increased
latency, and higher costs. Today we have no mechanism to compact a conversation's history, we prune
it using a moving window as we reach high level of context consumption leading to persistent high
context use.

Claude Code solves this with a multi-layered compaction system (autocompact, microcompact, session
memory compact) that summarizes the conversation and replaces the history with a compact summary.
We want to bring a similar capability to Dust conversations.

We want to introduce compaction capability to provide more explicit context management to users but
also to support forking a conversation into another one (fork would trigger a compaction that would
serve as starting point of the new conversation).

## Design Overview

Four parts:

1. **CompactionMessage** — a new message type that holds a compaction summary, inserted into the
   conversation when compaction is completed.
2. **Token consumption evaluation** — using the LLM's reported token usage from the last agent
   message to determine when compaction should trigger, and surfacing it client-side.
3. **Compaction method** — a new `compactConversation` method in `conversation.ts` that
   triggers compaction through Temporal.
4. **Blocking during compaction** — preventing `postUserMessage` while compaction is in progress,
   similar to steering's pending message mechanism.

---

## Part 1: CompactionMessage

### Why a New Message Type

The existing message types (`UserMessage`, `AgentMessage`, `ContentFragment`) don't fit:

- **AgentMessage** — has actions, runIds, configuration, step contents, status lifecycle. A
  compaction summary has none of these. Adding a special status (e.g. `"compaction"`) would force
  every consumer of `AgentMessageType` to handle a degenerate case where most fields are
  null/empty.
- **ContentFragment** — designed for file/content-node attachments with MIME types, file IDs,
  snippets. Wrong semantics.
- **UserMessage** — has user, mentions, context. A compaction summary is system-generated.

A `CompactionMessage` is a fourth variant in the `MessageType` union with its own focused shape.

### Data Model

```typescript
// front/types/assistant/conversation.ts

type CompactionMessageStatus = "created" | "succeeded" | "failed";

type CompactionMessageType = {
  type: "compaction_message";
  id: ModelId;
  compactionMessageId: ModelId;
  sId: string;
  created: number;
  visibility: MessageVisibility;
  version: number;
  rank: number;
  branchId: string | null;

  // Compaction payload.
  status: CompactionMessageStatus;  // Lifecycle: created → succeeded | failed.
  content: string | null;           // null while status is "created".
};
```

`visibility`, `version`, `rank`, and `branchId` come from `MessageModel` (same as all other
message types) and are serialized on `CompactionMessageType` like the other message variants.

```
MessageType = AgentMessageType | UserMessageType | ContentFragmentType | CompactionMessageType
```

### Status Lifecycle

- `"created"` — compaction is in progress (LLM is generating the summary). The `content` field
  is `null`. The UI shows a loading indicator. `postUserMessage` is blocked.
- `"succeeded"` — summary generation completed. `content` is populated. The compaction message
  acts as a history boundary for model rendering.
- `"failed"` — summary generation failed. The compaction message is inert (not a history
  boundary). The conversation continues normally with full history.

This mirrors `AgentMessage`'s status pattern — the message is created first, then updated when
the async work completes.

### DB Model

```typescript
// front/lib/models/agent/conversation.ts

export class CompactionMessageModel extends WorkspaceAwareModel<CompactionMessageModel> {
  declare status: CompactionMessageStatus;
  declare content: string | null;
}
```

`MessageModel` gets a fourth optional FK: `compactionMessageId`. The existing validation hook
(exactly one FK non-null) is extended to include the new FK.

### Relationship Diagram Update

```
Message (sId, rank, version, branchId, visibility)
  │
  ├─ 0:1 ── UserMessage
  ├─ 0:1 ── AgentMessage
  ├─ 0:1 ── ContentFragment
  └─ 0:1 ── CompactionMessage (status, content)
```

### Rendering for the Model

When rendering the conversation for a model call (`renderConversationForModel`), a
`CompactionMessage` acts as a **history boundary**:

- Messages **before** the compaction message are **not rendered** (they've been summarized).
- The compaction message itself is rendered as a dedicated model message with `role:
  "compaction"`, wrapping the summary in `<compaction_summary>` tags. Provider adapters then
  convert that role to a user message for the upstream LLM API.
- Messages **after** the compaction message are rendered normally.

If multiple compaction messages exist (compaction happened more than once), only the **last** one
is the active boundary — everything before it is hidden. Each compaction summary represents the
**entire** conversation up to that point: when generating a new compaction, the previous
compaction's summary is included as input alongside the messages since that compaction, producing
a single unified summary.

### Rendering for the UI

In the conversation UI, a compaction message is rendered as a lightweight separator/divider:

- A visual indicator (e.g. "Earlier messages were summarized") with an expandable summary.
- Messages before it can be lazy-loaded if the user scrolls up (they still exist in the DB).

---

## Part 2: Token Consumption Evaluation

### Approach

Rather than estimating token counts (brittle across providers, hard to account for tool calls,
system prompts, etc.), we use the **actual `promptTokens` reported by the LLM provider** from the
most recent agent message's last run.

### How It Works

The chain is:

```
AgentMessageModel.runIds (string[])
  → last runId
    → RunModel.dustRunId
      → RunUsageModel.promptTokens
```

`promptTokens` = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (for
Anthropic). This is the **full input context size** as seen by the model — system prompt, all
messages, tool calls/results, everything.

Within a single agent message's multi-step loop, `promptTokens` is monotonically increasing
(each step sees all previous steps' outputs). Across agent messages, the first step of a new
message sees the full conversation + the new user message.

**Exception**: when context pruning kicks in (`prunedContext = true`), `promptTokens` may decrease
because older tool results are replaced with placeholders. But this means the conversation is
already at/near context limits — an even stronger signal for compaction.

### Trigger Logic

After each agent message completes (on `agent_message_success` or
`agent_message_gracefully_stopped`), check:

```
lastPromptTokens >= compactionThreshold
```

Where `compactionThreshold` is derived from the model's context window (e.g. 80% of the effective
context window, accounting for output token reservation).

When the threshold is crossed, trigger compaction:

1. Generate a summary of all messages up to and including the triggering agent message (via an LLM
   call, similar to Claude Code's compact prompt).
2. Create a `CompactionMessage` with the summary, inserted after the triggering agent message.
3. Future model calls use the compaction message as the history boundary.

### Where to Get the Token Count

The token count is not stored as a dedicated column — it's resolved on-the-fly from the existing
run usage data:

- `AgentMessageModel.runIds` contains the dustRunIds for each agent message.
- Query `RunResource.listByDustRunIds()` → take the last run (ordered by `createdAt`) →
  `listRunUsages()` → read `promptTokens`.
- This is a read-only lookup, no new columns needed.

### Client-Side Context Usage Reporting

The last `runId` of the most recent `AgentMessage` gives us the best estimate of the current
conversation's token footprint. We expose this through a dedicated endpoint that resolves the
token count on-the-fly:

```
GET /api/w/[wId]/assistant/conversations/[cId]/context-usage
→ { model: SupportedModel, contextUsage: number, contextSize: number }
```

The endpoint finds the last succeeded/gracefully-stopped `AgentMessage`, resolves its latest run
usage from `RunResource`, takes the max `promptTokens` across usages, and returns it alongside the
resolved model and its context window. The client can then compute:

```
contextUsagePercent = contextUsage / contextSize
```

This avoids any client-side token estimation — the number comes directly from the provider's
usage report, resolved on-the-fly from the existing run data.

---

## Part 3: Compaction Method

### `compactConversation` in `conversation.ts`

A new method in `front/lib/api/assistant/conversation.ts` orchestrates compaction through Temporal,
following the same patterns as `postUserMessage` and `updateAgentMessageWithFinalStatus`:

```typescript
export async function compactConversation(
  auth: Authenticator,
  {
    conversation,
    model,
  }: {
    conversation: ConversationType;
    model: SupportedModel;
  }
): Promise<
  Result<{ compactionMessage: CompactionMessageType }, APIErrorWithStatusCode>
>
```

**Flow:**

1. Reject the request if an agent message or another compaction is already running.
2. Acquire the conversation advisory lock (`getConversationRankVersionLock`).
3. Create a `CompactionMessage` with `status: "created"` and `content: null`. This immediately
   signals to the rest of the system that compaction is in progress.
4. Publish a `CompactionMessageNewEvent` on the conversation SSE channel.
5. Launch a Temporal workflow (`compactionWorkflow`) that:
   a. Reads all messages before the compaction message (or since the last succeeded compaction).
   b. Renders them into a compaction prompt.
   c. Calls an LLM to generate the summary.
   d. Updates the `CompactionMessage` with `status: "succeeded"` and the generated `content`.
   e. On failure, updates to `status: "failed"`.
6. Return the created `compactionMessage` to the caller.

### Temporal Workflow

The compaction runs as a separate Temporal workflow on the **agent loop queue**
(`agent-loop-queue-v2` in the `agent` namespace), collocated with the agent loop code under
`front/temporal/agent_loop/`. This is similar to how `agentLoopConversationTitleWorkflow` lives
alongside the main agent loop.

Reasons for a separate workflow (vs inline in finalization):

- Summary generation is an LLM call that can take 10-30s — too long to block finalization.
- It's independently retryable if the LLM call fails.
- It cleanly separates the agent loop lifecycle from compaction lifecycle.

The workflow is initially triggered from `compactConversation()` in `conversation.ts` (called by
the API endpoint). In the future it could also be triggered directly from the agent loop
finalization path when context usage exceeds the compaction threshold, similar to how the title
workflow is spawned as a child workflow after the first step.

---

## Part 4: Blocking During Compaction

### Problem

While compaction is in progress (`CompactionMessage` with `status: "created"` exists), the
conversation is in a transitional state. If a user posts a new message during this window, the new
message would be ranked after the compaction message, but the compaction summary wouldn't cover
it. This leads to inconsistent state.

### Solution

`postUserMessage` checks for a `CompactionMessage` with `status: "created"` in the conversation
and returns an error:

```typescript
const pendingCompaction = await CompactionMessageModel.findOne({
  where: { status: "created", /* in this conversation */ },
});

if (pendingCompaction) {
  return new Err({
    status_code: 409,
    message: "Conversation is being compacted, please wait.",
  });
}
```

No separate `compacting` flag is needed on the conversation — the `CompactionMessage` status
**is** the flag. This is cleaner: no extra column, no risk of flag/state divergence, and the
compaction message is the single source of truth.

If compaction fails (`status: "failed"`), the compaction message is inert and `postUserMessage`
is no longer blocked.

### SSE Events

The compaction message lifecycle uses the same event pattern as agent messages:

```typescript
// Emitted when compaction starts (CompactionMessage created with status: "created").
export type CompactionMessageNewEvent = {
  type: "compaction_message_new";
  created: number;
  conversationId: string;
  message: CompactionMessageType;
};

// Emitted when compaction completes or fails (status → "succeeded" | "failed").
export type CompactionMessageDoneEvent = {
  type: "compaction_message_done";
  created: number;
  conversationId: string;
  message: CompactionMessageType;
};
```

The frontend subscribes to these events to:
- Show a loading/compacting indicator when `compaction_message_new` arrives.
- Update the compaction message and re-enable input when `compaction_message_done` arrives.

### Interaction with Steering

Steering and compaction can race: an agent message pushes the conversation past the compaction
threshold, but before it finishes (and before compaction fires), a steering message is promoted.
Once the agent message completes, both the compaction and the promoted steering message want to
proceed concurrently.

Steering should take precedence when it was pending before compaction triggered — this preserves
the user's perceived message ordering (they sent the message before the system decided to compact).
Compaction then runs after the steering message has been promoted and its agent reply completed (or
at least promoted), so the compaction summary covers the steered exchange as well.

This ordering means the conversation may temporarily exceed the context window between the steering
message being processed and compaction completing. This is why we must retain context pruning as a
catch-all safety net: compaction is the primary mechanism for managing context size, but pruning
remains the backstop when compaction hasn't kicked in yet and the context window is exhausted.

Initially, compaction will be user-triggered (blocking the input bar once context usage reaches a
high threshold). But triggers, wake-ups, and API calls can still produce agent messages that push
past the context window without user interaction — so the system must be resilient to compaction
arriving _after_ the context window has been exceeded.

---

## High-Level Work Required

### Phase 1: CompactionMessage Type & Model (no behavior changes)

| # | Work | Notes |
|---|------|-------|
| 1 | Add `CompactionMessageType` to `front/types/assistant/conversation.ts` | New type in `MessageType` union, type guard `isCompactionMessageType()` |
| 2 | Add `CompactionMessageModel` in `front/lib/models/agent/conversation.ts` | New Sequelize model with `status`, `content` |
| 3 | Migration: add `compaction_message` table + `compactionMessageId` FK on `message` table | Update CHECK constraint on MessageModel validation hook |
| 4 | Handle `"compaction_message"` in all exhaustive switches on `MessageType` | Audit all switch/if-else on message type discrimination |

### Phase 2: Token Consumption Evaluation

| # | Work | Notes |
|---|------|-------|
| 5 | Add a context-usage endpoint | Resolve the latest run usage on-the-fly and return `{ model, contextUsage, contextSize }` |

### Phase 3: Compaction Method & Temporal Workflow

| # | Work | Notes |
|---|------|-------|
| 6 | Add `compactConversation` in `conversation.ts` | Advisory lock, create `CompactionMessage` with `status: "created"`, publish SSE event, launch Temporal workflow |
| 7 | Block `postUserMessage` when a `CompactionMessage` with `status: "created"` exists | Return 409, following steering pattern |
| 8 | Add `CompactionMessageNewEvent` / `CompactionMessageDoneEvent` SSE events | Mirrors `AgentMessageNewEvent` / `AgentMessageDoneEvent` pattern |
| 9 | Implement `compactionWorkflow` Temporal workflow | Read messages, call LLM, update `CompactionMessage` with content + `status: "succeeded"` |
| 10 | Implement compaction summary generation prompt | LLM call with compaction prompt (adapt from Claude Code's approach) |

### Phase 4: Rendering, API, Pruning & UI (pending design)

| # | Work | Notes |
|---|------|-------|
| 11 | Update `renderConversationForModel` to use compaction as history boundary | Skip messages before the last compaction, render the summary as a `role: "compaction"` message |
| 12 | Update conversation API endpoints to include `CompactionMessageType` | Serialization, fetching |
| 13 | Update `groupMessagesIntoInteractions` to account for compaction boundaries | Compaction message starts a new boundary for interaction grouping |
| 14 | Update context pruning to work with compacted conversations | Pruning should only apply to messages after the compaction boundary |
| 15 | Context usage indicator in conversation UI | Use `{ model, contextUsage, contextSize }` to compute the percentage client-side |
| 16 | Compaction message rendering in conversation UI | Separator/divider with expandable summary |

### Phase 5: Future UI/UX Integration

| # | Work | Notes |
|---|------|-------|
| 18 | Figure out triggering condition | Is it just a UI thing? Do we trigger from the agent loop? |
| 19 | `/compact` command | Manual compaction trigger from the conversation input |
| 20 | User notifications | Notify users when they've reached high context usage |
