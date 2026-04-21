# Agent-Initiated Wake-Up

## Problem

Agents today are purely reactive — they respond to user messages and triggers but cannot schedule
future actions within a session. A common need: "check if the Slack thread got a reply in 10
minutes", "remind me at 3pm", "poll this endpoint every hour until it returns 200". Today the
user must come back and manually poke the agent.

## Goal

Provide a skill (always enabled) that lets agents schedule wake-ups within a conversation. When the
wake-up fires, the agent resumes in the same conversation with full context. Supports one-shot
Delays ("in 2 hours"), absolute times ("at 2026-04-16T16:00Z"), and cron patterns
("0 9 * * MON-FRI").

## Design Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Agent action: schedule_wakeup                              │
│  { when: "in 2h" | "2026-04-16T16:00Z" | "0 9 * * MON",     │
│    reason: "check Slack thread for reply" }                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  WakeUpResource (new model)                                 │
│  - conversationId (FK → ConversationModel)                  │
│  - workspaceId                                              │
│  - userId (user associated with the agent loop, nullable)   │
│  - agentConfigurationId                                     │
│  - scheduleType: "one_shot" | "cron"                        │
│  - scheduleConfig (fireAt timestamp | cron+tz)              │
│  - reason (injected in wake-up message + displayed in UI)   │
│  - status: scheduled | fired | cancelled | expired          │
│  - fireCount                                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Temporal (agent-schedule-v1 queue, reused)                 │
│                                                             │
│  One-shot: wakeUpWorkflow { sleep(duration) → activity }    │
│  Cron:     client.schedule.create() → wakeUpWorkflow        │
│                                                             │
│  Workflow ID: wakeup-{workspaceId}-{wakeUpId}               │
└──────────────────────┬──────────────────────────────────────┘
                       │ fires
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  runWakeUpActivity                                          │
│  1. Fetch WakeUpResource, verify status = scheduled         │
│  2. Fetch conversation                                      │
│  3. postUserMessage into the conversation:                  │
│     - origin: "wakeup"                                      │
│     - username: "Dust" (not the human user)                 │
│     - doNotAssociateUser: true                              │
│     - content: "Wake-up: {reason}"                          │
│     - mention the agent                                     │
│  4. Update WakeUpResource:                                  │
│     - fireCount++                                           │
│     - one_shot → status = fired                             │
│     - cron + fireCount >= MAX_FIRES → status = expired,     │
│       delete Temporal schedule (MAX_FIRES is a code const)  │
│  5. Steering handles the busy-agent case automatically      │
│     (pending user message path).                            │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

### New model: `WakeUpModel`

```sql
CREATE TABLE wake_ups (
  id              BIGSERIAL PRIMARY KEY,
  "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "workspaceId"   BIGINT NOT NULL REFERENCES workspaces(id),
  "conversationId" BIGINT NOT NULL REFERENCES conversations(id),
  "userId"        BIGINT REFERENCES users(id),  -- null for API-created wake-ups
  "agentConfigurationId" TEXT NOT NULL,
  "scheduleType"  TEXT NOT NULL,             -- "one_shot" | "cron"
  "fireAt"        TIMESTAMP WITH TIME ZONE,  -- for one_shot
  "cronExpression" TEXT,                      -- for cron
  "cronTimezone"  TEXT,                       -- for cron
  "reason"        TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | fired | cancelled | expired
  "fireCount"     INTEGER NOT NULL DEFAULT 0
);

-- Indexes.
CREATE INDEX idx_wake_ups_conversation ON wake_ups("conversationId");
CREATE INDEX idx_wake_ups_user ON wake_ups("userId");
CREATE INDEX idx_wake_ups_workspace_status ON wake_ups("workspaceId", "status");
```

### New Resource: `WakeUpResource`

Wraps `WakeUpModel`. Key methods:

- `makeNew(auth, { conversationId, agentConfigurationId, scheduleType, ... })` — creates row +
  starts Temporal workflow/schedule.
- `cancel(auth)` — sets status to `cancelled`, terminates Temporal workflow/schedule.
- `markFired()` — increments `fireCount`, updates status for one-shot.
- `listByConversation(auth, conversationId)` — for UI display.
- `listActiveByWorkspace(auth)` — for guardrail checks.
- `toJSON()` — serializes to the shared `WakeUpType` shape.
+
+Also define shared Zod-backed types in `front/types/assistant/wakeups.ts`:
+
+- `WakeUpScheduleConfig`
+- `WakeUpOneShotScheduleConfig`
+- `WakeUpCronScheduleConfig`
+- `WakeUpType`
+
+These types should be the source of truth for endpoint and UI serialization.

## Temporal Workflows

Reuse the `agent-schedule-v1` queue (currently used by `agentTriggerWorkflow`). Add a new workflow
alongside it.

### `wakeUpWorkflow` (new, in `front/temporal/triggers/common/workflows.ts`)

```typescript
export async function wakeUpWorkflow({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): Promise<void> {
  await runWakeUpActivity({ workspaceId, wakeUpId });
}
```

For **one-shot** wake-ups, the workflow is started with a `startDelay` computed from the `fireAt`
timestamp. The workflow body is just the activity call — Temporal handles the delay natively via
`startDelay` on `client.workflow.start()`.

For **cron** wake-ups, a Temporal Schedule is created (via `client.schedule.create()`) pointing at
`wakeUpWorkflow`, reusing the same `buildScheduleSpec()` helper from the trigger infrastructure.

### `runWakeUpActivity` (new, in `front/temporal/triggers/common/activities.ts`)

1. Fetch `WakeUpResource` by sId, verify `status === "scheduled"`.
2. Fetch conversation via `ConversationResource`.
3. Authenticate as the wake-up's userId via `Authenticator.fromUserIdAndWorkspaceId()` (the agent
   runs under that user's credentials). If userId is null (API-created), use
   `Authenticator.internalAdminForWorkspace()`.
4. Call `postUserMessage` with:
   - `content`: `@agent Wake-up: {reason}`
   - `context.origin`: `"wakeup"` (new origin value)
   - `context.username`: `"Dust"`
   - `context.profilePictureUrl`: Dust logo URL or null
   - `doNotAssociateUser: true`
   - `steeringEnabled: true` (follows steering path if agent is busy)
5. Update `WakeUpResource`: increment `fireCount`, update status.
6. For one-shot: done (workflow completes). For cron where `fireCount >= MAX_FIRES` (code
   constant): cancel the Temporal schedule and set status to `expired`.

## Agent Skill Interface

The wake-up is exposed as an always-enabled agent action (like retrieval or browse). The agent
calls it as a tool:

```
schedule_wakeup({
  when: string,   // "in 2h", "in 30m", "2026-04-16T16:00:00Z", "0 9 * * MON-FRI"
  reason: string  // Displayed in UI, injected in wake-up message
})
```

The `when` field is parsed server-side:
- Relative durations ("in Xh", "in Xm") → `scheduleType: "one_shot"`, compute `fireAt`.
- ISO timestamps → `scheduleType: "one_shot"`, use directly as `fireAt`.
- Cron expressions → `scheduleType: "cron"`, with default `maxFires` from guardrails.

Returns to the agent: confirmation with the scheduled time and wake-up ID.

## Message Origin

Add `"wakeup"` to the `UserMessageOrigin` union type in
`front/types/assistant/conversation.ts`. The wake-up message:

- Appears in the conversation as a message from "Dust" (not from the human user).
- Uses `doNotAssociateUser: true` so it does not mark the conversation as read or appear in the
  user's activity feed as their own message.
- Mentions the agent so it triggers agent execution.
- Contains the reason so the agent has context on why it was woken up.

## Security

### Authentication at fire time

The wake-up activity authenticates as the user who owns the agent loop that created the wake-up
(stored as `userId` on the `WakeUpResource`). The agent runs with that user's credentials and
permissions. This creates a privilege escalation risk: if another user posts messages in the
conversation before the wake-up fires, they can steer the agent's behavior at wake-up time while
it executes under the original user's auth context.

### Conversation interaction restrictions

To mitigate this, while a conversation has active wake-ups with an associated user (`userId` is
set), only that user is allowed to post messages in the conversation. Other users attempting to
post will receive an error explaining that the conversation has a pending wake-up owned by another
user.

- Admins and the wake-up owner can cancel the wake-up (which lifts the restriction).
- If the wake-up was created by an agent loop triggered via API with no associated user
  (`userId` is null), the restriction does not apply — anyone with access to the conversation can
  interact, and anyone with access can also cancel the wake-up.

This is a conservative starting point. We may relax restrictions later (e.g., allow read-only
access, or allow messages that don't mention agents) once we better understand the threat model.

### Cancellation permissions

| Wake-up has userId | Who can cancel                                  |
|--------------------|-------------------------------------------------|
| Yes                | The wake-up owner (userId) or workspace admins  |
| No (API-created)   | Anyone with access to the conversation          |

## Steering Integration

When the wake-up fires:

- **Agent idle**: message is posted with `visibility: "visible"`, agent starts normally.
- **Agent running, same agent**: message is posted with `visibility: "pending"`. The steering code
  path gracefully stops the current run, then promotes the pending message and the agent processes
  it.
- **Agent running, different agent**: steering rejects mentions to a different agent than the one
  currently running. In this case `runWakeUpActivity` backs off and retries after a delay (e.g.,
  30s exponential backoff, capped at a few minutes). The Temporal activity retry policy handles
  this naturally — the activity throws a retryable error and Temporal re-schedules it. A maximum
  retry window (e.g., 10 minutes) prevents the wake-up from retrying indefinitely; after that the
  wake-up is marked as `expired` and the user is notified.

## Guardrails

Per-conversation limits (enforced at `schedule_wakeup` action time):

| Guardrail                      | Default | Rationale                          |
|--------------------------------|---------|------------------------------------|
| Max active wake-ups / conv     | 1       | One wake-up at a time per conv     |
| Min interval between fires     | 5 min   | Prevent tight polling loops        |
| Max cron fires                 | 512     | Prevent unbounded recurring runs   |
| Max cron lifetime              | None    | Need ability to keep a frame green |
| Max one-shot delay             | 1 month | Prevent far-future orphans         |

Per-workspace limits (enforced alongside existing trigger rate limits):

| Guardrail                      | Default | Rationale                          |
|--------------------------------|---------|------------------------------------|
| Max active wake-ups / workspace| 256     | Prevent workspace-wide abuse       |
| Wake-up fires count as         |         | Same billing treatment as          |
| programmatic usage             |         | trigger-fired messages             |

When a guardrail is hit, the `schedule_wakeup` action returns an error to the agent explaining the
limit. The agent can inform the user.

## UI

### Conversation view — "Waiting" state

When a conversation has active wake-ups (`status = scheduled`):
- Show a banner/pill: "Waiting until {time} — {reason}" (or "Next wake-up: {cron
  description}").
- Cancel button to let the user dismiss the wake-up.
- Multiple active wake-ups shown as a list.

=> Design TBD

### Wake-up message rendering

The wake-up message appears in the conversation thread as a system-style message:
- Sender: "Dust" (with Dust logo)
- Content: "Wake-up: {reason}"
- Visual treatment: slightly distinct from regular user messages (similar to how trigger messages
  are shown today possibly).

### Notifications

When a wake-up fires:
- Conversation moves to "active" in the sidebar if it was dormant.
- Notification remains aligned with what we do currently

## Files to Modify

### New files

| File | Purpose |
|------|---------|
| `front/lib/models/agent/wakeup.ts` | `WakeUpModel` Sequelize model |
| `front/lib/resources/wakeup_resource.ts` | `WakeUpResource` wrapping the model |
| `front/types/assistant/wakeups.ts` | Shared Zod schemas / serialized wake-up types |
| `front/lib/api/assistant/wakeup.ts` | Business logic (create, cancel, list) |
| `front/lib/actions/wakeup_action.ts` | Agent action definition for `schedule_wakeup` |
| `front/pages/api/w/[wId]/assistant/conversations/[cId]/wakeups/index.ts` | API: list/cancel |
| `front/lib/swr/wakeups.ts` | SWR hooks |
| `front/components/assistant/conversation/WakeUpBanner.tsx` | UI waiting state |
| `front/migrations/db/migration_XXX.sql` | DB migration |

### Modified files

| File | Change |
|------|--------|
| `front/types/assistant/conversation.ts` | Add `"wakeup"` to `UserMessageOrigin` |
| `front/temporal/triggers/common/workflows.ts` | Add `wakeUpWorkflow` |
| `front/temporal/triggers/common/activities.ts` | Add `runWakeUpActivity` |
| `front/temporal/triggers/common/worker.ts` | Activities auto-registered (no change needed) |
| `front/lib/api/assistant/agent_action.ts` | Register `schedule_wakeup` action |
| `front/components/assistant/conversation/` | Render wake-up messages + banner |

## Resolved Decisions

1. **Authentication**: The activity authenticates as the wake-up's `userId` (the user whose agent
   loop created it). For API-created wake-ups with no user, uses internal admin auth. See Security
   section for interaction restrictions that prevent privilege escalation.

2. **Conversation cleanup**: Handled in code, not via DB cascade. When a conversation is deleted,
   the deletion logic cancels all active wake-ups (Temporal workflows/schedules) and deletes the
   `WakeUpModel` rows explicitly.

3. **Wake-up message content**: Exact format to be figured out during implementation. The message
   should include a `<dust_system>` contextual block explaining that this is a wake-up, followed
   by the reason provided by the agent when scheduling it.

4. **Billing**: Wake-up fires count as programmatic usage, same treatment as trigger-fired
   messages.

5. **`when` parsing**: Deterministic. The agent generates structured input — no need for LLM
   parsing. Accepted formats: relative durations (`"in 2h"`, `"in 30m"`), ISO 8601 timestamps,
   standard 5-field cron expressions.

## Additional implementation notes

- In the current codebase, `schedule_wakeup` should be wired through the internal MCP tool
  architecture rather than a legacy `front/lib/api/assistant/agent_action.ts` registry.
- The firing path should define idempotency explicitly, e.g. an atomic claim / fire transition and
  a persisted fired message identifier, so retries cannot post duplicate wake-up messages.
- Cancel-vs-fire races should be handled explicitly by `WakeUpResource`, not left to best effort.
- Missing/deleted conversation, user, workspace, or inaccessible agent at fire time should be
  terminal `cancelled` / `expired` states, not infinite retries.
- The new private API endpoint should keep Swagger annotations/schemas in sync.
- Emit audit events for create / cancel / fire / expire.
- Add focused tests for resource invariants, Temporal behavior, permissions, API, and UI.
- For V1, the UI can assume max 1 active wake-up per conversation, matching the guardrail above.
