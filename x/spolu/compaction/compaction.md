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
3. **Compaction method** — a new `compactConversation` method in `conversation.ts` that triggers
   compaction through Temporal.
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
  id: ModelId;
  sId: string;
  type: "compaction_message";
  created: number;
  version: number;
  rank: number;
  branchId: number;

  // Compaction payload.
  status: CompactionMessageStatus;  // Lifecycle: created → succeeded | failed.
  content: string | null;           // null while status is "created".
};
```

`visibility`, `version`, `rank`, `branchId` come from `MessageModel` (same as all other message
types). `CompactionMessageType` doesn't need its own visibility field.

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
- The compaction message itself is rendered as a system or user message containing the summary
  (similar to Claude Code's post-compact summary message).
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

The token count is already available in the finalization path of the agent loop:

- `finalizeSuccessfulAgentLoopActivity` and `finalizeGracefullyStoppedAgentLoopActivity` both have
  access to the `agentLoopArgs` which contains `runIds`.
- Query `RunResource.listByDustRunIds()` → take the last run → `listRunUsages()` → read
  `promptTokens`. Note: ensure results are returned ordered (e.g., by `createdAt`) so that "last
  run" is deterministic.
- Alternatively, surface the token count earlier in the agent loop (it's available from the
  `TokenUsageEvent` during streaming) and pass it through to finalization.

### Client-Side Context Usage Reporting

The last `runId` of the most recent `AgentMessage` gives us the best estimate of the current
conversation's token footprint. We surface this to the client so the UI can display context usage
(e.g. a progress bar showing how full the context window is).

On `agent_message_success` (and `agent_message_gracefully_stopped`), the finalization path
resolves the last run's `promptTokens` and includes it in the event payload (or on the
`AgentMessageType` itself). The client can then compute:

```
contextUsagePercent = lastPromptTokens / modelContextWindow
```

This avoids any client-side token estimation — the number comes directly from the provider's
usage report.

---

## Part 3: Compaction Method

### `compactConversation` in `conversation.ts`

A new method in `front/lib/api/assistant/conversation.ts` that orchestrates compaction through
Temporal, following the same patterns as `postUserMessage` and
`updateAgentMessageWithFinalStatus`:

```typescript
export async function compactConversation(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationType;
  }
): Promise<Result<CompactionMessageType, ConversationError>>
```

**Flow:**

1. Acquire the conversation advisory lock (`getConversationRankVersionLock`).
2. Create a `CompactionMessage` with `status: "created"` and `content: null`. This immediately
   signals to the rest of the system that compaction is in progress.
3. Launch a Temporal workflow (`compactConversationWorkflow`) that:
   a. Reads all messages before the compaction message (or since the last succeeded compaction).
   b. Renders them into a compaction prompt.
   c. Calls an LLM to generate the summary.
   d. Updates the `CompactionMessage` with `status: "succeeded"` and the generated `content`.
   e. On failure, updates to `status: "failed"`.
4. Publish a `CompactionMessageNewEvent` on the conversation SSE channel (mirrors
   `AgentMessageNewEvent` pattern).

### Temporal Workflow

The compaction runs as a separate Temporal workflow (not inline in the agent loop finalization)
because:

- Summary generation is an LLM call that can take 10-30s — too long to block finalization.
- It's independently retryable if the LLM call fails.
- It cleanly separates the agent loop lifecycle from compaction lifecycle.

The workflow is triggered from the agent loop finalization path when the threshold is crossed, or
could be triggered manually via an API endpoint.

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

### Phase 2: Compaction Method & Temporal Workflow

| # | Work | Notes |
|---|------|-------|
| 5 | Add `compactConversation` in `conversation.ts` | Advisory lock, create `CompactionMessage` with `status: "created"`, launch Temporal workflow |
| 6 | Block `postUserMessage` when a `CompactionMessage` with `status: "created"` exists | Return 409, following steering pattern |
| 7 | Add `CompactionMessageNewEvent` / `CompactionMessageDoneEvent` SSE events | Mirrors `AgentMessageNewEvent` / `AgentMessageDoneEvent` pattern |
| 8 | Implement `compactConversationWorkflow` Temporal workflow | Read messages, call LLM, update `CompactionMessage` with content + `status: "succeeded"` |
| 9 | Implement compaction summary generation prompt | LLM call with compaction prompt (adapt from Claude Code's approach) |

### Phase 3: Rendering, API & Pruning

| # | Work | Notes |
|---|------|-------|
| 10 | Update `renderConversationForModel` to use compaction as history boundary | Skip messages before the last compaction, render summary as context |
| 11 | Update conversation API endpoints to include `CompactionMessageType` | Serialization, fetching |
| 12 | Update `groupMessagesIntoInteractions` to account for compaction boundaries | Compaction message starts a new "era" for interaction grouping |
| 13 | Update context pruning to work with compacted conversations | Pruning should only apply to messages after the compaction boundary |

### Phase 4: Client-Side Context Usage & UI (pending design)

| # | Work | Notes |
|---|------|-------|
| 14 | Resolve last run's `promptTokens` in agent loop finalization | Add to `AgentMessageSuccessEvent` or `AgentMessageType` |
| 15 | Surface context usage on conversation API responses | Include latest `promptTokens` + model context window so client can compute % |
| 16 | Context usage indicator in conversation UI | Progress bar / warning when approaching context limits |
| 17 | Compaction message rendering in conversation UI | Separator/divider with expandable summary |

### Phase 5: Future UI/UX Integration

| # | Work | Notes |
|---|------|-------|
| 18 | Figure out triggering condition | Is it just a UI thing? Do we trigger from the agent loop? |
| 19 | `/compact` command | Manual compaction trigger from the conversation input |
| 20 | User notifications | Notify users when they've reached high context usage |
