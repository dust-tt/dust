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
5 minutes. Cron firing semantics are still follow-up work, but the Temporal schedule create /
delete path now exists in `front/temporal/triggers/wakeup_client.ts`.

### [x] PR 4 — Wire WakeUpResource to Temporal

Connect `WakeUpResource.makeNew` and `cancel` to actual Temporal workflow start / cancellation via
`front/temporal/triggers/wakeup_client.ts`. One-shot wake-ups are now functional end-to-end at the
backend level.

Follow-up work remains for explicit duplicate-fire / cancel-vs-fire race handling, tighter retry
classification, audit events, and the cron path.

## Milestone 3: Cron wake-ups

### [x] PR 5 — Cron scheduling path

Create the cron Temporal path for wake-ups, reusing the existing trigger schedule patterns where
helpful.

Done:
- Temporal Schedule creation / deletion is implemented in
  `front/temporal/triggers/wakeup_client.ts`.
- `WakeUpResource.maxFires()` (backed by `MAX_WAKE_UP_FIRES = 32`) is exposed on `WakeUpType`, and
  `markFired(...)` transitions a cron wake-up to `expired` once `fireCount >= maxFires`.
- The wake-up `<dust_system>` message includes `fireCount / maxFires` and an expiration warning
  when the wake-up is about to expire.
- `cleanupTemporalAfterFire(...)` deletes the Temporal schedule after the final fire.
- `WakeUpResource.validateCron({ cron, timezone })` enforces a well-formed 5-field cron
  expression, a minimum interval of 5 minutes between fires, and a valid IANA timezone. It is
  called from `makeNew(...)` as a defense-in-depth check.

## Milestone 4: Agent action

### [x] PR 6 — `wakeups` internal MCP server

Adds the `wakeups` internal MCP server (id 1031, `availability: "auto"`, preview, gated
behind the new `enable_wakeups` feature flag) exposing `schedule_wakeup`, `list_wakeups`,
and `cancel_wakeup` to agents. `when` is parsed deterministically (relative duration, ISO
8601, 5-field cron); cron timezone falls back to the last user message's timezone.
Guardrails enforced at tool-call time: max 1 active wake-up per conversation, max 256 per
workspace, max 31-day one-shot delay. Also updates `runWakeUpActivity` to post the
wake-up message with `username: "dust_system"` / `fullName: "Dust System"` instead of
`doNotAssociateUser: true`.

## Milestone 5: Security

### [x] PR 7 — Conversation interaction restrictions

Two slices:

1. **Cancellation rights (`WakeUpResource.cancel`)** — only the wake-up owner (`userId`) or
   a workspace admin can cancel. Enforced via a `canCancel(auth)` check in `cancel(...)`
   that returns an `Err` before touching the Temporal workflow or marking the row
   cancelled.

2. **Post / edit restriction** — while a conversation has an active (scheduled) wake-up,
   only the wake-up owner can post or edit user messages. Shared logic lives on
   `WakeUpResource.canUserInteract(auth, conversation)`, which returns an
   `APIErrorWithStatusCode` (409 `invalid_request_error`) when any active wake-up is
   owned by a user other than the caller. Called from both `postUserMessage` and
   `editUserMessage` in `front/lib/api/assistant/conversation.ts`. The wake-up activity
   posts under the owner's auth (via `fetchWakeUpAndAuthenticatorById`), so fires are
   never blocked.

`retryAgentMessage` is intentionally not gated — it does not take user input beyond
selecting an existing agent message.

## Milestone 6: API + UI

### PR 8 — Wake-up API endpoints

`GET/DELETE /api/w/[wId]/assistant/conversations/[cId]/wakeups`. List active wake-ups, cancel by
sId. SWR hooks. Keep private Swagger docs/annotations in sync.

### PR 9 — Conversation UI

Wake-up banner ("Waiting until {time} — {reason}" + cancel button). Wake-up message rendering
(system-style message from "Dust"). Conversation moves to active in sidebar when wake-up fires.
For V1, the UI can assume max 1 active wake-up per conversation.

## Milestone 7: Cleanup + GA

### PR 10 — Conversation deletion cleanup

Hook into conversation deletion to cancel active wake-ups and clean up Temporal workflows. Handle
edge cases (workspace scrubbing, user deletion, archived/inaccessible agent).

### PR 11 — Remove feature flag

Remove gate, enable for all workspaces.

## Testing

Add focused tests alongside the relevant PRs for resource invariants, firing/cancellation races,
Temporal behavior, permissions, API, and UI.
