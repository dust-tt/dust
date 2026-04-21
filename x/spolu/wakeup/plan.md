# Wake-Up Implementation Plan

## Milestone 1: Data layer (no runtime behavior)

### [x] PR 1 — WakeUpModel + migration

Add the `wake_ups` table (migration), `WakeUpModel` Sequelize model, indexes on `conversationId`,
`userId`, and `(workspaceId, status)`. Require `userId` to be non-null so wake-ups can only be
created in a user context. Add `"wakeup"` to `UserMessageOrigin` union type and usage
classification.

Status: merged, including SDK / Swagger / observability updates for the new origin. Agent
replies to wake-up messages are treated like regular unread replies for notifications.

### [x] PR 2 — WakeUpResource

`WakeUpResource` wrapping the model: `makeNew`, `cancel`, `markFired`, `listByConversation`,
`listActiveByWorkspace`, `toJSON`. Includes cleanup logic for conversation deletion (cancel
Temporal workflows + delete rows). No Temporal calls yet — stub them behind a flag. Also add
shared `WakeUp` Zod schemas / types in `front/types/assistant/wakeups.ts` so API and UI code can
reuse the same serialized shape.

## Milestone 2: Temporal execution (one-shot only)

### [x] PR 3 — wakeUpWorkflow + runWakeUpActivity

Add `wakeUpWorkflow`, `runWakeUpActivity`, and `expireWakeUpActivity` to the shared
`agent-schedule-v1` queue in `front/temporal/triggers/{workflows,activities}.ts`. Wire up the
one-shot path with `startDelay` on `client.workflow.start()`. The activity resolves the wake-up
and acting user via `WakeUpResource.fetchWakeUpAndAuthenticatorById(...)`, fetches the
conversation with `getConversation(...)`, posts a user message with `origin: "wakeup"`,
`doNotAssociateUser: true`, `username: "Dust"`, and a `<dust_system>` context block, then marks
the wake-up as fired.

Current terminal / retry behavior:
- Missing workspace or wake-up: non-retryable failure.
- Missing or inaccessible conversation: mark `cancelled` and stop.
- Posting failure: retry via Temporal backoff.
- Retry exhaustion or timeout: mark `expired` via `expireWakeUpActivity(...)`.

Current retry policy: 3 attempts, exponential backoff starting at 30 seconds, max interval
5 minutes. Cron wake-ups still return an unsupported error for now.

### [x] PR 4 — Wire WakeUpResource to Temporal

Connect `WakeUpResource.makeNew` and `cancel` to actual Temporal workflow start / cancellation via
`front/temporal/triggers/wakeup_client.ts`. One-shot wake-ups are now functional end-to-end at the
backend level.

Follow-up work remains for explicit duplicate-fire / cancel-vs-fire race handling, tighter retry
classification, audit events, and the cron path.

## Milestone 3: Agent action

### PR 5 — schedule_wakeup tool (one-shot)

Agent tool definition for `schedule_wakeup`. Deterministic `when` parsing (relative durations, ISO
timestamps). Guardrail enforcement (max 1 active per conversation, min interval, max delay,
workspace limits). Returns confirmation with scheduled time and wake-up sId. Gate behind feature
flag. In the current codebase, wire this through the internal MCP tool architecture rather than a
legacy `agent_action.ts` registry.

## Milestone 4: Security

### PR 6 — Conversation interaction restrictions

Enforce that only the wake-up owner can post in a conversation with an active wake-up.
Cancellation permissions are owner + workspace admins.

## Milestone 5: API + UI

### PR 7 — Wake-up API endpoints

`GET/DELETE /api/w/[wId]/assistant/conversations/[cId]/wakeups`. List active wake-ups, cancel by
sId. SWR hooks. Keep private Swagger docs/annotations in sync.

### PR 8 — Conversation UI

Wake-up banner ("Waiting until {time} — {reason}" + cancel button). Wake-up message rendering
(system-style message from "Dust"). Conversation moves to active in sidebar when wake-up fires.
For V1, the UI can assume max 1 active wake-up per conversation.

## Milestone 6: Cron wake-ups

### PR 9 — Cron scheduling path

Extend `schedule_wakeup` to accept cron expressions. Create Temporal Schedules via
`client.schedule.create()` reusing `buildScheduleSpec()`. `fireCount` tracking + `MAX_FIRES`
expiration. Cron-specific guardrails.

## Milestone 7: Cleanup + GA

### PR 10 — Conversation deletion cleanup

Hook into conversation deletion to cancel active wake-ups and clean up Temporal workflows. Handle
edge cases (workspace scrubbing, user deletion, archived/inaccessible agent).

### PR 11 — Remove feature flag

Remove gate, enable for all workspaces.

## Testing

Add focused tests alongside the relevant PRs for resource invariants, firing/cancellation races,
Temporal behavior, permissions, API, and UI.
