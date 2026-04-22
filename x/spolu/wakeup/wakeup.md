# Agent-Initiated Wake-Up

## Problem

Agents today are purely reactive — they respond to user messages and triggers but cannot schedule
future actions within a session. A common need: "check if the Slack thread got a reply in 10
minutes", "remind me at 3pm", "poll this endpoint every hour until it returns 200". Today the
user must come back and manually poke the agent.

## Goal

Provide a skill (always enabled) that lets agents schedule wake-ups within a conversation. When the
wake-up fires, the agent resumes in the same conversation with full context. The overall design
supports one-shot delays ("in 2 hours"), absolute times ("at 2026-04-16T16:00Z"), and cron
patterns ("0 9 * * MON-FRI").

Current implementation status: the backend Temporal path is implemented for one-shot wake-ups, and
cron wake-ups now have schedule create / delete, `fireCount` / `maxFires` expiration, and
validation of the cron expression and timezone at creation time. Cron-specific guardrails beyond
validation, the tool surface, API endpoints, and UI are still follow-up work.

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
│  - userId (user associated with the agent loop, required)   │
│  - agentConfigurationId                                     │
│  - scheduleType: "one_shot" | "cron"                        │
│  - scheduleConfig (fireAt timestamp | cron+tz)              │
│  - reason (injected in wake-up message + displayed in UI)   │
│  - status: scheduled | fired | cancelled | expired          │
│  - fireCount / maxFires (MAX_WAKE_UP_FIRES = 32)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Temporal (agent-schedule-v1 queue, reused)                 │
│                                                             │
│  One-shot: client.workflow.start(..., startDelay)           │
│            → wakeUpWorkflow → runWakeUpActivity             │
│  Cron:     client.schedule.create() / delete()              │
│            → wakeUpWorkflow → runWakeUpActivity             │
│                                                             │
│  Workflow ID: wakeup-{workspaceId}-{wakeUpId}               │
└──────────────────────┬──────────────────────────────────────┘
                       │ fires
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  runWakeUpActivity                                          │
│  1. Resolve WakeUpResource + wake-up owner auth             │
│  2. Verify status = scheduled                               │
│  3. Fetch conversation and call getConversation(...)        │
│  4. postUserMessage into the conversation:                  │
│     - origin: "wakeup"                                      │
│     - username: "Dust"                                      │
│     - doNotAssociateUser: true                              │
│     - content: <dust_system> + "Wake-up reason: ..."        │
│     - mentions: [{ configurationId: agentConfigurationId }] │
│  5. fireCount++ and:                                        │
│     - one_shot → status = fired                             │
│     - cron + fireCount >= maxFires → status = expired       │
│       + delete Temporal schedule                            │
│  6. Missing / inaccessible conversation → cancelled         │
│     Retry exhaustion / timeout → expired                    │
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
  "userId"        BIGINT NOT NULL REFERENCES users(id),
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

- `makeNew(auth, { conversationId, agentConfigurationId, scheduleType, ... })` — creates the row
  and starts the Temporal workflow.
- `cancel(auth)` — cancels the Temporal workflow and sets status to `cancelled`.
- `markFired()` — increments `fireCount` and updates status:
  - `one_shot` → `fired`
  - `cron` + `fireCount >= maxFires()` → `expired`
  - `cron` otherwise → stays `scheduled`
- `markExpired()` — sets status to `expired`.
- `maxFires()` — returns the constant `MAX_WAKE_UP_FIRES` (currently 32).
- `validateCron({ cron, timezone })` — validates a cron expression and its timezone for wake-ups:
  well-formed 5-field cron, minimum interval of 5 minutes between fires, and valid IANA timezone.
  Called from `makeNew(...)` as a defense-in-depth check.
- `cleanupTemporalAfterFire(auth)` — deletes the Temporal schedule for cron wake-ups once they
  have reached `expired`.
- `listByConversation(auth, conversationId)` — for UI display.
- `listActiveByWorkspace(auth)` — for guardrail checks.
- `fetchWakeUpAndAuthenticatorById({ workspaceId, wakeUpId })` — resolves the wake-up and the
  wake-up owner's authenticator for Temporal activities.
- `toJSON()` — serializes to the shared `WakeUpType` shape (including `fireCount` and `maxFires`).

Also define shared Zod-backed types in `front/types/assistant/wakeups.ts`:

- `WakeUpScheduleConfig`
- `WakeUpOneShotScheduleConfig`
- `WakeUpCronScheduleConfig`
- `WakeUpType`

These types should be the source of truth for endpoint and UI serialization.

## Temporal Workflows

Reuse the `agent-schedule-v1` queue (currently used by `agentTriggerWorkflow`). The current
implementation adds wake-up handling alongside the existing trigger workflow in the shared files:
`front/temporal/triggers/workflows.ts`, `front/temporal/triggers/activities.ts`, and
`front/temporal/triggers/wakeup_client.ts`.

### `wakeUpWorkflow` (current, in `front/temporal/triggers/workflows.ts`)

`wakeUpWorkflow` wraps `runWakeUpActivity(...)` with Temporal retry handling. For one-shot wake-ups,
the workflow is started with a `startDelay` computed from `fireAt`. On retry exhaustion or timeout,
the workflow calls `expireWakeUpActivity(...)` to mark the wake-up as `expired`.

Current retry policy:
- initial interval: 30 seconds
- backoff coefficient: 2
- maximum interval: 5 minutes
- maximum attempts: 3
- non-retryable error type: `WakeUpNonRetryableError`

Cron wake-ups are partially implemented. `launchOrScheduleWakeUpTemporalWorkflow(...)` can now
create a Temporal Schedule for `scheduleType: "cron"`, and `cancelWakeUpTemporalWorkflow(...)` can
delete it. Recurring fire semantics now track `fireCount / maxFires` and automatically expire the
wake-up once the fire count reaches `maxFires`; the Temporal schedule is deleted after the final
fire via `cleanupTemporalAfterFire(...)`.

### `runWakeUpActivity` (current, in `front/temporal/triggers/activities.ts`)

1. Resolve the wake-up and acting user with
   `WakeUpResource.fetchWakeUpAndAuthenticatorById({ workspaceId, wakeUpId })`.
2. Verify `status === "scheduled"`.
3. Fetch the conversation resource and then the full conversation with `getConversation(...)`.
4. Call `postUserMessage(...)` with:
   - a `<dust_system>` block containing the wake-up sId, `fireCount / maxFires`, and (when the
     wake-up is about to reach `maxFires`) an expiration warning
   - `Wake-up reason: {reason}`
   - `context.origin: "wakeup"`
   - `context.username: "Dust"`
   - `doNotAssociateUser: true`
   - `mentions: [{ configurationId: wakeUp.agentConfigurationId }]`
5. Mark the wake-up as fired on success (`markFired(...)` handles one-shot vs cron and the
   `fireCount >= maxFires` expiration transition).
6. For cron wake-ups that have just expired, call `cleanupTemporalAfterFire(...)` to delete the
   Temporal schedule.
7. Mark the wake-up as cancelled when the conversation is missing or inaccessible.
8. Let Temporal retry posting failures. If retries are exhausted, `expireWakeUpActivity(...)`
   marks the wake-up as expired.

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

To mitigate this, while a conversation has an active wake-up, only the wake-up owner is allowed to
post messages in the conversation. Other users attempting to post will receive an error explaining
that the conversation has a pending wake-up owned by another user.

- Admins and the wake-up owner can cancel the wake-up, which lifts the restriction.

This is a conservative starting point. We may relax restrictions later (e.g., allow read-only
access, or allow messages that don't mention agents) once we better understand the threat model.

### Cancellation permissions

| Wake-up | Who can cancel                                 |
|---------|------------------------------------------------|
| Any     | The wake-up owner (userId) or workspace admins |

## Steering Integration

When the wake-up fires, it is posted through the normal `postUserMessage(...)` path with
`origin: "wakeup"` and `doNotAssociateUser: true`.

Current behavior is intentionally simple:
- missing or inaccessible conversations are treated as terminal cancellation
- posting failures bubble up to Temporal and are retried according to the workflow retry policy
- retry exhaustion marks the wake-up as `expired`

A follow-up can make retry classification more specific for steering-related failures.

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

The wake-up message appears in the conversation thread as a Dust-authored wake-up message:
- Sender: "Dust"
- Content: a `<dust_system>` block including the wake-up sId, followed by `Wake-up reason: {reason}`
- Visual treatment: can be refined later in the dedicated UI work

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
| `front/temporal/triggers/workflows.ts` | Add `wakeUpWorkflow` + retry / expiry handling |
| `front/temporal/triggers/activities.ts` | Add `runWakeUpActivity` and `expireWakeUpActivity` |
| `front/temporal/triggers/wakeup_client.ts` | Start / cancel one-shot workflows and create / delete cron schedules |
| `front/lib/resources/wakeup_resource.ts` | Temporal integration + activity helpers |
| `front/types/assistant/wakeups.ts` | Shared wake-up schemas and types |

## Resolved Decisions

1. **Authentication**: The activity resolves the wake-up owner through
   `WakeUpResource.fetchWakeUpAndAuthenticatorById(...)` and posts using that user's workspace
   authenticator.

2. **Conversation cleanup**: Handled in code, not via DB cascade. When a conversation is deleted,
   the deletion logic cancels all active wake-ups (Temporal workflows / schedules) and deletes the
   `WakeUpModel` rows explicitly.

3. **Wake-up message content**: The current implementation posts a `<dust_system>` block that
   includes the wake-up sId and `fireCount / maxFires`, and an expiration warning when the
   wake-up is about to reach `maxFires`, followed by `Wake-up reason: {reason}`.

4. **Billing**: Wake-up fires count as programmatic usage, same treatment as trigger-fired
   messages.

5. **`when` parsing**: Deterministic. The agent generates structured input — no need for LLM
   parsing. Accepted formats: relative durations (`"in 2h"`, `"in 30m"`), ISO 8601 timestamps,
   standard 5-field cron expressions.

## Additional implementation notes

- In the current codebase, `schedule_wakeup` should be wired through the internal MCP tool
  architecture rather than a legacy `front/lib/api/assistant/agent_action.ts` registry.
- The current implementation can create / delete cron schedules, tracks `fireCount / maxFires`,
  automatically expires cron wake-ups once `fireCount >= maxFires`, and validates the cron
  expression and timezone at creation time. Remaining cron work is cron-specific guardrails
  beyond validation.
- Explicit duplicate-fire protection is not implemented. A follow-up should define the
  idempotency story clearly.
- Cancel-vs-fire races are still best-effort today and should be tightened in `WakeUpResource`.
- The current implementation retries generic posting failures and expires after retry exhaustion.
  A follow-up can narrow retry behavior to the intended steering-related cases.
- The new private API endpoint should keep Swagger annotations/schemas in sync.
- Emit audit events for create / cancel / fire / expire.
- Add focused tests for resource invariants, Temporal behavior, permissions, API, and UI.
- For V1, the UI can assume max 1 active wake-up per conversation, matching the guardrail above.
