# Proposal: Graceful Stop of the Agent Loop

## Context

@conversation_structure.md

## Problem

Today, the only way to stop a running agent loop is the **cancel signal** (`cancelAgentLoopSignal`),
which immediately cancels all in-flight activities (model calls, tool calls) via
`CancellationScope.cancel()`, sets the agent message status to `"cancelled"`, and emits
`agent_generation_cancelled`. This is a hard stop — partial tool results are lost.

We need a **graceful stop** that lets the current step complete (model call + all tool
executions finish normally), then exits the loop cleanly. The agent message retains all content
produced so far and is marked as gracefully stopped.

## Existing Agent Message Statuses

```typescript
type AgentMessageStatus = "created" | "succeeded" | "failed" | "cancelled";
```

- `"created"` — loop is running.
- `"succeeded"` — loop completed normally (model returned no more actions).
- `"failed"` — unrecoverable error during execution.
- `"cancelled"` — hard cancel signal received, in-flight activities killed.

## Design

### New Status: `"gracefully_stopped"`

```typescript
type AgentMessageStatus = "created" | "succeeded" | "failed" | "cancelled" | "gracefully_stopped";
```

- `"gracefully_stopped"` — the loop was gracefully stopped after the current step completed. All content
  through the last step is valid and complete. Unlike `"cancelled"` (which kills in-flight
  activities and may lose partial results), a gracefully stopped message has clean, usable output.

The agent message status is set to `"gracefully_stopped"` and finalization follows a new
`finalizeGracefullyStoppedAgentLoopActivity` path that mirrors `finalizeSuccessfulAgentLoopActivity`
(analytics, usage tracking, notifications, butler signaling, etc.) since the content is valid.

### New Signal

```typescript
// front/temporal/agent_loop/signals.ts

export const gracefullyStopAgentLoopSignal = defineSignal<[void]>(
  "gracefully_stop_agent_loop_signal"
);
```

### Signal Handler in `agentLoopWorkflow`

The signal sets a flag but does **not** cancel the execution scope (unlike `cancelAgentLoopSignal`).
In-flight activities continue to completion:

```typescript
// front/temporal/agent_loop/workflows.ts

let gracefulStopRequested = false;

setHandler(gracefullyStopAgentLoopSignal, () => {
  gracefulStopRequested = true;
});
```

### Loop Integration

The `gracefulStopRequested` flag is checked at the step boundary, after `executeStepIteration()`
returns. If set, the loop breaks regardless of `shouldContinue`:

```typescript
for (let i = startStep; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
  const { runId, shouldContinue } = await executeStepIteration({ ... });

  // ... metrics, title generation ...

  if (!shouldContinue || gracefulStopRequested) {
    break;
  }
}

// ... metrics ...

await CancellationScope.nonCancellable(async () => {
  if (gracefulStopRequested) {
    await finalizeGracefullyStoppedAgentLoopActivity(authType, agentLoopArgs);
  } else {
    await finalizeSuccessfulAgentLoopActivity(authType, agentLoopArgs);
  }
});
```

When `gracefulStopRequested` is true, the loop exits normally (no exception) and routes to
`finalizeGracefullyStoppedAgentLoopActivity`, which sets the agent message status to `"gracefully_stopped"`
and runs the same side-effects as successful finalization.

### Sending the Signal

**Client function** (alongside existing `cancelMessageGenerationEvent`):

```typescript
// front/lib/api/assistant/pubsub.ts

export async function gracefullyStopAgentLoop(
  auth: Authenticator,
  {
    agentMessageId,
    conversationId,
  }: {
    agentMessageId: string;
    conversationId: string;
  }
): Promise<void> {
  const client = await getTemporalClientForAgentNamespace();
  const workflowId = makeAgentLoopWorkflowId({
    workspaceId: auth.getNonNullableWorkspace().sId,
    conversationId,
    agentMessageId,
  });

  try {
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(gracefullyStopAgentLoopSignal);
  } catch (err) {
    // Workflow may have already completed — safe to ignore.
    logger.info({ workflowId, err }, "Non-fatal: could not signal graceful stop");
  }
}
```

This will be called internally by the pending user message flow (covered in a separate proposal)
when it needs to gracefully stop the loop for steering, and exposed to the user via an API
endpoint for explicit graceful stop requests.

## Graceful Stop Requested Event

When a graceful stop is requested (before the loop actually stops), a
`GracefulStopRequestedEvent` is published on the **conversation SSE channel** so the frontend
can immediately react (e.g. show "stopping..." state, remove the stop button).

The event carries a `reason` to distinguish the two cases:

```typescript
// front/types/assistant/conversation.ts

export type GracefulStopReason = "user_requested" | "steering";

export interface GracefulStopRequestedEvent {
  type: "graceful_stop_requested";
  created: number;
  agentMessageSId: string;
  reason: GracefulStopReason;
}
```

- `"user_requested"` — the user explicitly clicked a stop/pause button. The UI should show that
  the message is being stopped and disable the stop button.
- `"steering"` — the system is stopping the loop to inject a pending user message as steering.
  The UI can show a different indicator (e.g. "processing your message...").

The event is published by `gracefullyStopAgentLoop()` right before sending the Temporal signal,
so the frontend gets the notification immediately (without waiting for the step to complete and
the loop to actually exit).

This is a **conversation-level event** (not a message-level event) so it's visible to all
subscribers of the conversation SSE stream.

## Comparison: Cancel vs. Graceful Stop

| Aspect | Cancel (`cancelAgentLoopSignal`) | Graceful Stop (`gracefullyStopAgentLoopSignal`) |
|--------|-------------------------------|--------------------------------------|
| In-flight activities | **Killed immediately** via `CancellationScope.cancel()` | **Run to completion** |
| Agent message status | `"cancelled"` | `"gracefully_stopped"` |
| Finalization | `finalizeCancelledAgentLoopActivity` | `finalizeGracefullyStoppedAgentLoopActivity` |
| Content | Partial (tokens flushed, but tool results may be lost) | Complete through last step |
| User-facing event | `agent_generation_cancelled` | `agent_message_gracefully_stopped` |
| Use case | User explicitly stops the agent | System needs to gracefully stop the loop to inject steering |

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `front/types/assistant/conversation.ts` | Add `"gracefully_stopped"` to `AgentMessageStatus` |
| 2 | `front/temporal/agent_loop/signals.ts` | Add `gracefullyStopAgentLoopSignal` |
| 3 | `front/temporal/agent_loop/workflows.ts` | Add `gracefulStopRequested` flag + handler, check at step boundary, route to gracefully stopped finalization |
| 4 | `front/temporal/agent_loop/activities/finalize.ts` | Add `finalizeGracefullyStoppedAgentLoopActivity` (mirrors successful finalization, sets status to `"gracefully_stopped"`) |
| 5 | `front/temporal/agent_loop/activities/common.ts` | Add `finalizeGracefulStop` (mirrors `finalizeCancellation` but sets `"gracefully_stopped"` + emits `agent_message_gracefully_stopped`) |
| 6 | `front/lib/api/assistant/pubsub.ts` | Add `gracefullyStopAgentLoop()` helper |

| 7 | `front/types/assistant/conversation.ts` | Add `GracefulStopRequestedEvent`, `AgentMessageGracefullyStoppedEvent` types |
| 8 | `front/lib/api/assistant/streaming/types.ts` | Add `"agent_message_gracefully_stopped"` to `TERMINAL_AGENT_MESSAGE_EVENT_TYPES` and both events to `ConversationEvents`/`AgentMessageEvents` unions |

No changes to:
- Frontend — the graceful stop will be controllable by the user, but design/UI is out of scope
  of this document.
