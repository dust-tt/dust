# Wake-Up Implementation Plan

## Milestone 1: Data layer (no runtime behavior)

### PR 1 — WakeUpModel + migration

Add the `wake_ups` table (migration), `WakeUpModel` Sequelize model, indexes on `conversationId`
and `(workspaceId, status)`. Add `"wakeup"` to `UserMessageOrigin` union type.

### PR 2 — WakeUpResource

`WakeUpResource` wrapping the model: `makeNew`, `cancel`, `markFired`, `listByConversation`,
`listActiveByWorkspace`. Includes cleanup logic for conversation deletion (cancel Temporal
workflows + delete rows). No Temporal calls yet — stub them behind a flag.

## Milestone 2: Temporal execution (one-shot only)

### PR 3 — wakeUpWorkflow + runWakeUpActivity

Add `wakeUpWorkflow` and `runWakeUpActivity` to the `agent-schedule-v1` queue. Wire up the
one-shot path: `startDelay` on `client.workflow.start()`. Activity posts a user message into the
conversation with `origin: "wakeup"`, `doNotAssociateUser: true`, `username: "Dust"`,
`<dust_system>` context block, and agent mention. Handles auth (userId-based or internal admin).
Back-off + retry when a different agent is running (retryable error, 10min max window).

### PR 4 — Wire WakeUpResource to Temporal

Connect `WakeUpResource.makeNew` and `cancel` to actual Temporal workflow start/terminate. Remove
stubs from PR 2. One-shot wake-ups are now fully functional end-to-end at the backend level.

## Milestone 3: Agent action

### PR 5 — schedule_wakeup action (one-shot)

Agent action definition for `schedule_wakeup`. Deterministic `when` parsing (relative durations,
ISO timestamps). Guardrail enforcement (max 1 active per conversation, min interval, max delay,
workspace limits). Returns confirmation with scheduled time and wake-up sId. Gate behind feature
flag.

## Milestone 4: Security

### PR 6 — Conversation interaction restrictions

Enforce that only the wake-up owner can post in a conversation with an active user-owned wake-up.
Cancellation permissions (owner + admins for user-owned, anyone for userless). Skip restrictions
for API-created wake-ups with no userId.

## Milestone 5: API + UI

### PR 7 — Wake-up API endpoints

`GET/DELETE /api/w/[wId]/assistant/conversations/[cId]/wakeups`. List active wake-ups, cancel by
sId. SWR hooks.

### PR 8 — Conversation UI

Wake-up banner ("Waiting until {time} — {reason}" + cancel button). Wake-up message rendering
(system-style message from "Dust"). Conversation moves to active in sidebar when wake-up fires.

## Milestone 6: Cron wake-ups

### PR 9 — Cron scheduling path

Extend `schedule_wakeup` to accept cron expressions. Create Temporal Schedules via
`client.schedule.create()` reusing `buildScheduleSpec()`. `fireCount` tracking + `MAX_FIRES`
expiration. Cron-specific guardrails.

## Milestone 7: Cleanup + GA

### PR 10 — Conversation deletion cleanup

Hook into conversation deletion to cancel active wake-ups and clean up Temporal workflows. Handle
edge cases (workspace scrubbing, user deletion).

### PR 11 — Remove feature flag

Remove gate, enable for all workspaces.
