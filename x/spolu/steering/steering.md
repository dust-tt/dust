# Proposal: Steering via Pending User Messages

## Context

@conversation_structure.md
@graceful_stop.md

## Problem

Today, when a user posts a message while an agent loop is running, `postUserMessage` creates a new
`UserMessage` + `AgentMessage` pair, launching a **parallel** agent loop. The user typically wants
to steer the running agent, not start a second one.

## Goal

When a user posts a message targeting an agent whose loop is still running, the message is inserted
into the conversation with a `"pending"` visibility, and the running agent loop is gracefully
stopped. Once the graceful stop completes, the pending messages are promoted to normal visibility
and a single new agent message is triggered — regardless of how many messages were sent while the
loop was running.

## Design Overview

```
User posts message while agent loop is running
  │
  ├─ Agent NOT running (status ≠ "created") → existing flow
  ├─ Only user mentions (no agent mention) → existing flow
  ├─ Agent mention ≠ running agent → error
  ├─ API caller → existing flow (no behavior change)
  │
  └─ Agent IS running + agent mention matches running agent
       │
       ├─ Create UserMessage + MessageModel with visibility "pending"
       ├─ Create MentionModel rows (agent + user mentions)
       ├─ Do NOT create AgentMessage
       ├─ Signal graceful stop on agent loop (reason: "steering")
       ├─ Publish UserMessageNewEvent (with pending visibility)
       │
       └─ Agent loop gracefully stops (status → "gracefully_stopped")
            │
            ├─ Promote all pending messages: visibility "pending" → "visible"
            ├─ Create one AgentMessage for the running agent
            ├─ Launch new agent loop
            └─ Publish events (promotion + new agent message)
```

## New Message Visibility: `"pending"`

```typescript
export type MessageVisibility = "visible" | "deleted" | "pending";
```

- `"pending"` — the message is in the conversation but the agent loop it targets has not yet
  gracefully stopped. The frontend renders it (greyed out / "waiting" state — design out of scope)
  but no agent message is created yet.

No new model or table is needed. We reuse `UserMessageModel` + `MessageModel` with the existing
schema — only the `visibility` field gets a new value.

## Changes to `postUserMessage`

**File:** `front/lib/api/assistant/conversation.ts`

### Constraints and Routing

```typescript
const agentMentions = mentions.filter(isAgentMention);

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
//     (notifications, access grants) that don't steer the agent loop.
//   - No mentions at all.
//   - API callers (always normal path to avoid breaking changes).
```

### API Callers

For API key / programmatic callers, `postUserMessage` always takes the normal path (creating a
new `UserMessage` + `AgentMessage` pair). This avoids breaking changes for existing API consumers.
Steering through the API is a niche use case unlikely to be built for now.

### Pending Path

When the pending path is taken:

1. **Inside the DB transaction** (which already holds the conversation advisory lock via
   `getConversationRankVersionLock`), re-read `AgentMessageModel.status`. If the status is no
   longer `"created"`, fall through to the normal flow.
2. Create `UserMessageModel` + `MessageModel` with `visibility: "pending"`.
3. Create `MentionModel` rows for all mentions (agent + user).
4. **Do NOT** create `AgentMessage` or agent `MessageModel` rows.
5. After commit:
   a. Publish `UserMessageNewEvent` with the pending user message (frontend shows it greyed out).
   b. Call `gracefullyStopAgentLoop()` with `reason: "steering"` (see graceful_stop.md).
6. Return `{ userMessage, agentMessages: [] }`.

## Detailed Sequence of Events

### API Side: `postUserMessage` (pending path)

All locked operations are in `front/lib/api/assistant/conversation.ts`.

```
postUserMessage()
  │
  ├─ Pre-transaction: constraints check (agent mention count, agent match)
  │
  └─ withTransaction(t):
       │
       ├─ getConversationRankVersionLock(auth, conversation, t)   ← acquire lock
       │
       ├─ Re-read AgentMessageModel.status within the transaction
       │    └─ If status ≠ "created" → fall through to normal flow (create UserMessage +
       │       AgentMessage as today). The agent finished between our initial check and
       │       acquiring the lock.
       │
       ├─ Create UserMessageModel (content, context, userId)
       ├─ Create MessageModel (visibility: "pending", rank, conversationId)
       ├─ Create MentionModel rows (agent + user mentions)
       ├─ Do NOT create AgentMessage or agent MessageModel
       │
       └─ COMMIT (releases lock)
            │
            ├─ Publish UserMessageNewEvent (visibility: "pending")     [conversation channel]
            └─ Call gracefullyStopAgentLoop(reason: "steering")
                 ├─ Publish GracefulStopRequestedEvent                 [conversation channel]
                 └─ Send gracefullyStopAgentLoopSignal                 [Temporal signal]
```

### Temporal Side: Graceful Stop + Promotion

The agent loop workflow receives the signal, finishes the current step, then exits the loop.
Finalization happens inside `finalizeGracefullyStoppedAgentLoopActivity`.

All locked DB operations go through a new function in `front/lib/api/assistant/conversation.ts`:

```typescript
// front/lib/api/assistant/conversation.ts

export async function finalizeGracefulStopAgentMessage(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
    agentConfiguration,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: AgentMessageType;
    agentConfiguration: LightAgentConfigurationType;
  }
): Promise<{ promoted: boolean }> {
  return withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    // 1. Mark current agent message as gracefully stopped.
    await AgentMessageModel.update(
      { status: "gracefully_stopped", completedAt: new Date() },
      { where: { id: agentMessage.agentMessageId }, transaction: t }
    );

    // 2. Find all pending messages in this conversation.
    const pendingMessages = await MessageModel.findAll({
      where: { conversationId: conversation.id, visibility: "pending" },
      order: [["rank", "ASC"]],
      transaction: t,
    });

    if (pendingMessages.length === 0) {
      return { promoted: false };
    }

    // 3. Promote: set visibility to "visible".
    await MessageModel.update(
      { visibility: "visible" },
      { where: { id: pendingMessages.map((m) => m.id) }, transaction: t }
    );

    // 4. Create one AgentMessage + MessageModel for the agent.
    //    parentMessageId points to the last pending message (highest rank).
    const { agentMessages } = await createAgentMessages(auth, {
      conversation,
      metadata: {
        type: "create",
        mentions: [{ configurationId: agentConfiguration.sId }],
        agentConfigurations: [agentConfiguration],
        skipToolsValidation: false,
        nextMessageRank: pendingMessages[pendingMessages.length - 1].rank + 1,
        userMessage: /* last pending message */,
      },
      transaction: t,
    });

    return { promoted: true, agentMessages, pendingMessages };
  });
}
```

Called from the Temporal activity:

```
finalizeGracefullyStoppedAgentLoopActivity()
  │
  ├─ Call finalizeGracefulStopAgentMessage()
  │    └─ withTransaction(t):
  │         ├─ getConversationRankVersionLock()                     ← acquire lock
  │         ├─ AgentMessageModel.update(status: "gracefully_stopped")
  │         ├─ MessageModel.findAll(visibility: "pending")
  │         ├─ MessageModel.update(visibility: "visible")           ← promote
  │         ├─ createAgentMessages()                                ← one new agent message
  │         └─ COMMIT (releases lock)
  │
  ├─ Publish agent_message_gracefully_stopped                      [message channel]
  ├─ Publish UserMessagePromotedEvent (per message)                [conversation channel]
  ├─ Publish AgentMessageNewEvent                                  [conversation channel]
  ├─ Launch new agentLoopWorkflow (startStep: 0)
  │
  └─ Run side-effects (analytics, usage tracking, notifications, etc.)
```

### Race Safety

The conversation advisory lock (`getConversationRankVersionLock`) serializes the two critical
sections:

| Operation | Lock holder | What happens under lock |
|-----------|-------------|------------------------|
| `postUserMessage` (pending path) | API server | Re-read agent message status + create pending message |
| `finalizeGracefulStopAgentMessage` | Temporal activity | Set status to `"gracefully_stopped"` + promote pending messages + create agent message |

Only one can hold the lock at a time. If the Temporal activity commits first (sets status to
`"gracefully_stopped"`), `postUserMessage` re-reads the status, sees it's no longer `"created"`,
and falls through to the normal flow. If `postUserMessage` commits first (creates the pending
message), the Temporal activity sees it and promotes it.

**Note:** Today, `updateAgentMessageDBAndMemory` updates `AgentMessageModel.status` with a bare
`UPDATE` — no transaction, no advisory lock. The `finalizeGracefulStopAgentMessage` function
replaces this for the graceful stop path. For the `"succeeded"` path, a similar
`finalizeSucceededAgentMessage` function should be added to `conversation.ts` that acquires the lock,
so that all terminal status transitions are serialized. This ensures the safety net works:

```typescript
// front/lib/api/assistant/conversation.ts

export async function finalizeSucceededAgentMessage(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
  }: {
    conversation: ConversationWithoutContentType;
    agentMessage: AgentMessageType;
  }
): Promise<void> {
  await withTransaction(async (t) => {
    await getConversationRankVersionLock(auth, conversation, t);

    await AgentMessageModel.update(
      { status: "succeeded", completedAt: new Date() },
      { where: { id: agentMessage.agentMessageId }, transaction: t }
    );

    // Safety net: promote orphaned pending messages if any exist.
    const pendingMessages = await MessageModel.findAll({
      where: { conversationId: conversation.id, visibility: "pending" },
      transaction: t,
    });

    if (pendingMessages.length > 0) {
      // Same promotion logic as finalizeGracefulStopAgentMessage.
      // This handles the edge case where the graceful stop signal was lost
      // or arrived after the loop already decided to exit naturally.
    }
  });
}
```

### Key Design Decisions

- **All locked conversation operations live in `conversation.ts`** — both the API side
  (`postUserMessage`) and the Temporal side (`finalizeGracefulStopAgentMessage`,
  `finalizeSucceededAgentMessage`) use the same advisory lock via `getConversationRankVersionLock`.
- **One agent message** regardless of how many pending messages were sent. The model sees all
  pending messages as conversation context and generates a single response.
- **`parentMessageId`** points to the last pending message (highest rank), establishing the
  correct conversation thread.
- The new agent loop starts at step 0 with the full conversation context (including the now-visible
  pending messages).

## Events

### New Event Type

```typescript
// front/types/assistant/conversation.ts

// Emitted when a pending message is promoted to visible after graceful stop.
export interface UserMessagePromotedEvent {
  type: "user_message_promoted";
  created: number;
  messageSId: string;
}
```

Add to `ConversationEvents` union in `front/lib/api/assistant/streaming/types.ts`.

### Event Flow

```
postUserMessage (pending path)
  → publish UserMessageNewEvent (visibility: "pending")     [conversation channel]
  → publish GracefulStopRequestedEvent (reason: "steering") [conversation channel]

Agent loop gracefully stops
  → publish agent_message_gracefully_stopped                [message channel]
  → promote pending messages
  → publish UserMessagePromotedEvent (per message)          [conversation channel]
  → publish AgentMessageNewEvent                            [conversation channel]
```

## Summary of Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `front/types/assistant/conversation.ts` | Add `"pending"` to `MessageVisibility`, add `wasPending` to `UserMessageType`, add `UserMessagePromotedEvent` |
| 2 | `front/lib/models/agent/conversation.ts` | Add `"pending"` to `MessageModel.visibility` validation, add `wasPending` boolean to `MessageModel` |
| 3 | New migration SQL | Update CHECK constraint on `visibility` column, add `wasPending` column to `messages` table |
| 4 | `front/lib/api/assistant/conversation.ts` | Constraints + pending path in `postUserMessage`; add `finalizeGracefulStopAgentMessage()` and `finalizeSucceededAgentMessage()` (all locked operations in one file) |
| 5 | `front/lib/api/assistant/conversation_rendering/helpers.ts` | Add steering instruction to `renderUserMessage()` when `wasPending` is true |
| 6 | `front/temporal/agent_loop/activities/finalize.ts` | `finalizeGracefullyStoppedAgentLoopActivity` calls `finalizeGracefulStopAgentMessage()`, publishes events, launches new agent loop |
| 7 | `front/lib/api/assistant/streaming/types.ts` | Add `UserMessagePromotedEvent` to `ConversationEvents` union |

Dependencies:
- graceful_stop.md must be implemented first (signal, status, finalization).

## Edge Cases

1. **Multiple pending messages** — All promoted together; one agent message created. The model
   sees all of them as conversation context.

2. **Agent loop ends naturally before graceful stop takes effect** — The advisory lock in
   `postUserMessage` catches this: if status is no longer `"created"`, falls through to normal
   flow. If the race is narrower (pending message created, but loop ends before the signal is
   processed), `finalizeSucceededAgentMessage` acts as safety net — it acquires the same advisory
   lock and promotes any orphaned pending messages.

3. **User sends message, then sends another before graceful stop completes** — Both are created
   as pending messages (each `postUserMessage` call takes the pending path, the graceful stop
   signal is idempotent). All are promoted together when the loop stops.

4. **Graceful stop requested by user (not steering)** — When the user explicitly requests a
   graceful stop (reason: `"user_requested"`), there are no pending messages to promote.
   `finalizeGracefullyStoppedAgentLoopActivity` finds no pending messages and skips promotion.

## Rendering Pending Messages for the Model

When the promoted pending messages are included in the new agent loop's conversation context, they
are rendered by `renderUserMessage()` (in `helpers.ts`). This function wraps each user message
with a `<dust_system>` block containing metadata:

```
<dust_system>
- Sender: John Doe (@John Doe) <john@example.com>
- Conversation: abc123
- Sent at: Apr 02, 2026, 14:30:00 UTC
- Source: web
</dust_system>

The actual message content here...
```

This rendering is already correct for steering messages — the sender identity, timestamp, and
source are all accurate and useful context for the model.

To make the model aware that these messages were sent to steer its current work (rather than
being a new conversation turn), an additional instruction is added to the `<dust_system>` block
for messages that were pending (i.e. sent while the previous agent loop was running):

```
<dust_system>
- Sender: John Doe (@John Doe) <john@example.com>
- Conversation: abc123
- Sent at: Apr 02, 2026, 14:30:00 UTC
- Source: web

This message was sent by the user to steer your current work.
</dust_system>

Please focus on the backend first...
```

### Implementation

In `renderUserMessage()` (`front/lib/api/assistant/conversation_rendering/helpers.ts`), the
`additionalInstructions` variable already supports appending context-specific instructions (e.g.
for Slack-originated messages). For steering messages, append a steering instruction when the
message was pending:

```typescript
if (m.wasPending) {
  additionalInstructions +=
    "This message was sent by the user to steer your current work.";
}
```

The `wasPending` flag needs to be carried on `UserMessageType`. This is a boolean set to `true`
when a message is promoted from `"pending"` to `"visible"`, and `false` for all other messages.
It is stored on `MessageModel` (not `UserMessageModel`) since `visibility` is also on
`MessageModel`.

### Introspection: Nothing Problematic in Existing `<dust_system>`

The existing `<dust_system>` content for user messages contains only:
- **Sender identity** (name, mention, email) — correct for steering, identifies who is steering.
- **Conversation ID** — neutral.
- **Timestamp** — useful, tells the model when the steering was sent relative to its work.
- **Source origin** (web, slack, etc.) — neutral.
- **Slack/Teams-specific instructions** ("retrieve context from thread", "tag users with @") —
  only added for those origins, not relevant for steering from web. No conflict.

None of these interfere with the model interpreting the message as steering. The added instruction
("sent by the user to steer your current work") is the only change needed.

## Open Questions

1. **Rendering of pending messages in UI** — Out of scope, currently being worked on by design.
