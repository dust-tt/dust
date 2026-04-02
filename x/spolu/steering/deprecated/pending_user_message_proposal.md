# Proposal: `PendingUserMessage` — Steering a Running Agent Loop

## Context

@conversation_structure.md
@steering_proposal.md (specifically Open Question 3: creation point)

## Problem

Today, when a user posts a message while an agent loop is running, `postUserMessage` creates a new
`UserMessage` + `AgentMessage` pair, launching a **parallel** agent loop. This is wasteful and
confusing — the user typically wants to steer the running agent, not start a second one.

## Goal

When a user posts a message targeting an agent whose loop is still running (`status === "created"`):

1. **If the loop has more steps** — inject the message as a `steering` `AgentStepContent` at
   the boundary between the current step and the next.
2. **If the loop ends at the current step** (final generation, no more tool calls) — create a
   normal `UserMessage` + `AgentMessage` pair to start a new agent loop (existing behavior).

## Design Overview

```
User posts message while agent loop is running
  │
  ├─ Agent NOT running (status ≠ "created") → existing flow (new UserMessage + AgentMessage)
  │
  └─ Agent IS running (status === "created")
       │
       ├─ Create PendingUserMessage in DB
       ├─ Signal agent loop workflow via Temporal signal
       │
       └─ Agent loop picks up signal at step boundary
            │
            ├─ Loop continues (more steps) → inject as steering AgentStepContent
            │                                  (streamed as steering AgentStepContent event)
            │
            └─ Loop ends (final step) → promote to full UserMessage + AgentMessage
                                         + launch new agent loop
```

## New Model: `PendingUserMessageModel`

### DB Schema

```typescript
class PendingUserMessageModel extends WorkspaceAwareModel<
  InferAttributes<PendingUserMessageModel>
> {
  declare sId: string;
  declare content: string;
  declare userContextUsername: string;
  declare userContextTimezone: string;
  declare userContextFullName: string | null;
  declare userContextEmail: string | null;
  declare userContextProfilePictureUrl: string | null;
  declare userContextOrigin: UserMessageOrigin;
  declare status: PendingUserMessageStatus;   // "pending" | "consumed"
  declare conversationId: ForeignKey<ConversationModel["id"]>;
  declare agentMessageId: ForeignKey<AgentMessageModel["id"]>;  // The running agent message
  declare userId: ForeignKey<UserModel["id"]> | null;
}
```

Fields mirror `UserMessageModel`'s `userContext*` columns. On promotion, they are copied directly
to the new `UserMessageModel` row.

**Status semantics:**
- `"pending"` — created, waiting for the agent loop to pick it up at step boundary.
- `"consumed"` — processed by the agent loop (either injected as `steering` into the running
  agent message's step content, or promoted to a full `UserMessage` + `AgentMessage` pair if the
  loop ended).

**Indexes:**
- `(conversationId, agentMessageId, status)` — lookup pending messages for a running agent.
- `(workspaceId)` — workspace-scoped cleanup.

**Location:** `front/lib/models/agent/conversation.ts` (alongside `UserMessageModel`)

### Type Definition

```typescript
// front/types/assistant/pending_user_message.ts

export type PendingUserMessageStatus = "pending" | "consumed";

export type PendingUserMessageType = {
  sId: string;
  content: string;
  context: UserMessageContext;  // Full user context (same as UserMessageType)
  user: UserType | null;        // Same as UserMessageType.user
  status: PendingUserMessageStatus;
  conversationId: string;
  agentMessageId: string;       // sId of the running AgentMessage
  created: number;
};
```

The full `UserMessageContext` is needed because:
- **Consumed path (steering)**: the `context` is passed directly as the `steering` step content's
  `value.context` (see `AgentSteeringContentType` in steering_proposal.md).
- **Promoted path (full message)**: the context is copied verbatim to create the `UserMessageModel`.

## Changes to `postUserMessage`

**File:** `front/lib/api/assistant/conversation.ts` (line 538)

### New Constraints and Routing

```typescript
const agentMentions = mentions.filter(isAgentMention);
const userMentions = mentions.filter(isUserMention);

// Constraint: at most one agent mention per message.
if (agentMentions.length > 1) {
  return new Err({
    status_code: 400,
    api_error: {
      type: "invalid_request_error",
      message: "Only one agent can be mentioned per message.",
    },
  });
}

const runningAgentMessage = conversation.content
  .flat()
  .find((m): m is AgentMessageType =>
    m.type === "agent_message" && m.status === "created"
  );

if (runningAgentMessage && agentMentions.length > 0) {
  // Constraint: cannot address a different agent than the running one.
  if (agentMentions[0].configurationId !== runningAgentMessage.configuration.sId) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Cannot address a different agent while one is running.",
      },
    });
  }

  // → Pending path (agent mention matches running agent).
}

// All other cases → normal path:
//   - No running agent message.
//   - Running agent but only user mentions (no agent mention) — these are regular messages
//     (notifications, access grants) that don't steer the agent loop. MentionModel requires a
//     MessageModel FK, which pending messages don't have.
//   - No mentions at all.
```

### Pending Path (agent mention matches running agent)

1. **Inside the DB transaction**, lock the `AgentMessageModel` row (`SELECT ... FOR UPDATE`) and
   re-check `status === "created"`. If the status has changed, abort the pending path and fall
   through to the normal flow (see §Race Safety below).
2. Create `PendingUserMessageModel` with `status: "pending"` in the same transaction.
3. **Do NOT** create `AgentMessage` or `MessageModel` rows.
4. After commit, signal the running agent loop workflow via a new Temporal signal.
5. Publish a `PendingUserMessageNewEvent` to the conversation SSE channel.
6. Return `{ userMessage: null, pendingUserMessage, agentMessages: [] }` (updated return type).

## Temporal Signal: `pendingUserMessageSignal`

### Signal Definition

```typescript
// front/temporal/agent_loop/signals.ts

export const pendingUserMessageSignal = defineSignal<
  [{ pendingUserMessageSId: string }]
>("pending_user_message_signal");
```

### Signal Handler in `agentLoopWorkflow`

```typescript
// front/temporal/agent_loop/workflows.ts

let pendingUserMessages: string[] = [];

setHandler(pendingUserMessageSignal, ({ pendingUserMessageSId }) => {
  pendingUserMessages.push(pendingUserMessageSId);
});
```

The signal is **non-interrupting** — it does not cancel in-flight activities. It simply queues
the pending message sId. The workflow checks `pendingUserMessages` at the step boundary.

### Step Boundary Handling

In the main loop, after `executeStepIteration()` returns and before checking `shouldContinue`:

```typescript
for (let i = startStep; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
  const { runId, shouldContinue } = await executeStepIteration({ ... });

  // --- NEW: process pending user messages at step boundary ---
  if (pendingUserMessages.length > 0) {
    const consumed = pendingUserMessages.splice(0);
    if (shouldContinue) {
      // Inject as steering into the NEXT step's context.
      await injectPendingAsSteeringActivity(authType, {
        agentLoopArgs,
        pendingUserMessageSIds: consumed,
        step: i,  // current completed step
      });
    } else {
      // Loop is ending — promote to full UserMessage + AgentMessage.
      await promotePendingMessagesActivity(authType, {
        agentLoopArgs,
        pendingUserMessageSIds: consumed,
      });
    }
  }

  if (!shouldContinue) break;
}

// --- NEW: drain any signals that arrived after the last step but before we exit ---
if (pendingUserMessages.length > 0) {
  await promotePendingMessagesActivity(authType, {
    agentLoopArgs,
    pendingUserMessageSIds: pendingUserMessages.splice(0),
  });
}
```

## New Activities

### `injectPendingAsSteeringActivity`

**Location:** `front/temporal/agent_loop/activities/inject_pending_steering.ts`

1. For each `pendingUserMessageSId`:
   a. Read `PendingUserMessageModel` from DB.
   b. Create `AgentStepContentResource` with `type: "steering"`,
      `value: { content, context: pendingMsg.userMessageContext }`,
      on the **completed step** (so it appears after tool results in rendering).
   c. Update `PendingUserMessageModel.status` → `"consumed"`.
2. The `steering` `AgentStepContent` event is published on the message channel via the
   existing streaming system — the frontend uses this to transition the pending message UI state.

### `promotePendingMessagesActivity`

**Location:** `front/temporal/agent_loop/activities/promote_pending_messages.ts`

1. For each `pendingUserMessageSId`:
   a. Read `PendingUserMessageModel` from DB.
   b. Create `UserMessageModel` + `MessageModel` (reusing context from pending).
   c. Create `AgentMessageModel` + `MessageModel` for the agent.
   d. Update `PendingUserMessageModel.status` → `"consumed"`.
2. Publish `UserMessageNewEvent` + `AgentMessageNewEvent` (conversation channel).
3. Launch new `agentLoopWorkflow` for the new agent message.

## Events

### New Event Types

```typescript
// front/types/assistant/conversation.ts

// Emitted when a PendingUserMessage is created (user posted while agent running).
export interface PendingUserMessageNewEvent {
  type: "pending_user_message_new";
  created: number;
  pendingUserMessage: PendingUserMessageType;
}

// Emitted when a PendingUserMessage is consumed (promoted to full message + new agent loop).
export interface PendingUserMessageConsumedEvent {
  type: "pending_user_message_consumed";
  pendingUserMessageSId: string;
  userMessageSId: string;
  agentMessageSId: string;
}
```

Add to `ConversationEvents` union in `front/lib/api/assistant/streaming/types.ts`.

### Event Flow

```
postUserMessage (pending path)
  → publish PendingUserMessageNewEvent          [conversation channel]

Agent loop step boundary (consumed)
  → steering AgentStepContent event         [message channel, via existing streaming]
  (frontend correlates with its pending message to update UI state)

Agent loop step boundary (consumed → promoted to full message)
  → publish PendingUserMessageConsumedEvent       [conversation channel]
  → publish UserMessageNewEvent                  [conversation channel]
  → publish AgentMessageNewEvent                 [conversation channel]
```

## Summary of Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `front/types/assistant/pending_user_message.ts` | New file: type definitions |
| 2 | `front/lib/models/agent/conversation.ts` | Add `PendingUserMessageModel` |
| 3 | New migration SQL | Create `pending_user_messages` table |
| 4 | `front/lib/api/assistant/conversation.ts` | Constraints + pending path with `FOR UPDATE` lock in `postUserMessage` |
| 5 | `front/temporal/agent_loop/signals.ts` | Add `pendingUserMessageSignal` |
| 6 | `front/temporal/agent_loop/workflows.ts` | Signal handler + step boundary logic + post-loop drain |
| 7 | `front/temporal/agent_loop/activities/inject_pending_steering.ts` | New activity: consume → steering |
| 8 | `front/temporal/agent_loop/activities/promote_pending_messages.ts` | New activity: promote → full message |
| 9 | `front/temporal/agent_loop/activities/finalize.ts` | All three finalize activities: query + promote orphaned pending messages |
| 10 | `front/types/assistant/conversation.ts` | New event types |
| 11 | `front/lib/api/assistant/streaming/types.ts` | Add events to `ConversationEvents` union |

## Race Safety: `postUserMessage` vs. Agent Loop Finalization

The core race is between `postUserMessage` deciding to take the pending path and the agent loop
finishing. Three mechanisms work together to eliminate orphaned pending messages:

### The Race

```
T1: postUserMessage reads agentMessage.status === "created" → decides pending path
T2: Agent loop finalization sets status = "succeeded"
T3: postUserMessage creates PendingUserMessageModel, sends Temporal signal
T4: Signal dropped (workflow already completed), pending message orphaned
```

### Fix A — Row-level locking in `postUserMessage` (prevents the race)

Inside the DB transaction, `postUserMessage` acquires a `SELECT ... FOR UPDATE` lock on the
`AgentMessageModel` row and re-checks `status === "created"` before creating the
`PendingUserMessageModel`:

```typescript
await withTransaction(async (t) => {
  // Lock the agent message row — serializes against finalization.
  const agentMessageRow = await AgentMessageModel.findByPk(
    runningAgentMessage.agentMessageId,
    { lock: t.LOCK.UPDATE, transaction: t }
  );

  if (!agentMessageRow || agentMessageRow.status !== "created") {
    // Agent loop finished between our initial check and acquiring the lock.
    // Fall through to normal flow (new UserMessage + AgentMessage).
    return { fallbackToNormalFlow: true };
  }

  // Safe to create — the agent loop cannot finalize until we release the lock.
  await PendingUserMessageModel.create({ status: "pending", ... }, { transaction: t });
});
```

### Fix B — Drain after loop exit (catches late signals)

Signals that arrive after the last `executeStepIteration()` but before the loop variable is
checked are caught by a drain block after the `for` loop (see §Step Boundary Handling above).
This handles Race 1 (signal arrives after loop break but while workflow is still running).

### Fix C — Finalization promotes orphans from DB (ultimate safety net)

All three finalize activities query the DB for `PendingUserMessageModel` rows with
`status: "pending"` for this `agentMessageId` and promote them. This is the safety net for any
edge case where the signal was lost or the drain didn't catch it:

```typescript
// In finalizeSuccessfulAgentLoopActivity, finalizeCancelledAgentLoopActivity,
// and finalizeErroredAgentLoopActivity:

const orphanedPending = await PendingUserMessageModel.findAll({
  where: { agentMessageId, status: "pending" },
});

for (const pending of orphanedPending) {
  await promotePendingMessage(auth, pending);
}
```

Finalization runs in `CancellationScope.nonCancellable`, so this always executes.

### Why all three are needed

| Scenario | Fix A | Fix B | Fix C |
|----------|-------|-------|-------|
| Signal arrives during step execution | — | — | — (normal path) |
| Signal arrives after loop break, workflow still running | — | **catches** | backup |
| `postUserMessage` creates row after finalization starts | **prevents** | — | — |
| `postUserMessage` creates row after finalization query but before commit | **prevents** (row lock) | — | — |
| Unexpected Temporal signal loss | — | — | **catches** |

Fix A is the primary mechanism — it serializes the decision. Fix B and C are defense-in-depth.

## Edge Cases

1. **Multiple pending messages** — If the user sends several messages before a step completes, all
   are queued in `pendingUserMessages` and processed together at the next boundary. In both paths
   (steering and promotion), all pending messages are concatenated into a single value:
   - **Steering**: one `AgentStepContent` with `type: "steering"` whose `content` is the
     concatenation of all pending messages (separated by newlines). The `context` is taken from
     the first pending message (all come from the same user).
   - **Promotion**: one `UserMessage` whose `content` is the concatenation of all pending
     messages, triggering a single new `AgentMessage` + agent loop.

2. **Agent loop fails/cancels** — All finalize activities (`finalizeSuccessfulAgentLoopActivity`,
   `finalizeCancelledAgentLoopActivity`, `finalizeErroredAgentLoopActivity`) query the DB for
   orphaned `PendingUserMessageModel` rows with `status: "pending"` and promote them (concatenated
   into a single `UserMessage`). This runs inside `CancellationScope.nonCancellable`.

3. **Lock contention** — The `FOR UPDATE` lock on `AgentMessageModel` is held only for the
   duration of the transaction that creates the `PendingUserMessageModel` (milliseconds). The
   finalization path that sets `status = "succeeded"` will briefly wait for this lock, which is
   acceptable — it's the same pattern used by `getConversationRankVersionLock`.

4. **`postUserMessage` fallback** — If the `FOR UPDATE` lock check reveals the agent has already
   finished (`status !== "created"`), `postUserMessage` abandons the pending path and falls through
   to the normal flow: create `UserMessage` + `AgentMessage`, launch new agent loop.

## API Callers

For API key / programmatic callers, `postUserMessage` always falls back to the current behavior
(creating a new `UserMessage` + `AgentMessage` pair, no pending message creation). This avoids
breaking changes for existing API consumers, and supporting steering through the API is a niche
use case unlikely to be built for now.

## Open Questions

1. **Rendering of pending messages in UI** — Out of scope, currently being worked on by design.
