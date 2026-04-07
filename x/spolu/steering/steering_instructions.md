# Future: `wasPending` Flag + Steering Instructions

Deferred from steering.md. Can be implemented once steering is working end-to-end.

## Overview

Add a `wasPending` boolean on `MessageModel` (set to `true` when promoting pending messages to
visible) so that `renderUserMessage()` can append a steering instruction to the `<dust_system>`
block, making the model aware that the message was sent to steer its current work.

## Type Changes

- Add `wasPending: boolean` (default `false`) to `MessageModel`.
- Add `wasPending` to `UserMessageType`.
- Migration: add `wasPending` column to `messages` table.

## Rendering

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

### Promotion Logic

When promoting pending messages in `finalizeGracefulStopAgentMessage`, set `wasPending: true`:

```typescript
await MessageModel.update(
  { visibility: "visible", wasPending: true },
  { where: { id: pendingMessages.map((m) => m.id) }, transaction: t }
);
```
