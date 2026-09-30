# PostHog Server Side

Two layers, both in `front`:

- `front/lib/api/posthog.ts`: `PostHogServerSideTracking`, the only place `posthog-node` is
  instantiated. Client is lazy, keyed by `config.getPostHogApiKey()`
  (`NEXT_PUBLIC_POSTHOG_KEY`), host `https://eu.i.posthog.com`. No key means every call is a no-op,
  which is the local and test default.
- `front/lib/tracking/server.ts`: `ServerSideTracking`, the orchestrator that fans lifecycle
  events out to PostHog and Customer.io. Use it for signup and login; use
  `PostHogServerSideTracking` directly for product outcomes.

## `PostHogServerSideTracking.trackEvent`

```ts
PostHogServerSideTracking.trackEvent({
  distinctId: user.sId, // always the user sId, never email or ModelId
  event: "fair_use_limit_blocked", // flat snake_case outcome name
  workspaceId: owner.sId, // becomes groups.workspace
  extra: {
    // flat scalars, sIds, unit suffixes
    limit_credits: maxAwuCredits,
    timeframe: maxAwuCreditsTimeframe,
    used_credits: microCreditsToCredits(result.value),
    origin: context.origin,
  },
});
```

Behavior to rely on:

- returns `void`; never `await` it and never let it influence the response
- wraps `client.capture` in try/catch and logs with `logger.error`, so callers do not add their own
- sends `extra` both spread (PostHog filters) and as the `extra` object (Snowflake), same as the
  client helper
- `posthog-node` batches and flushes asynchronously; in short-lived scripts call
  `getClient()?.shutdown()` equivalent before exit or events are lost (long-running workers and
  the API do not need this)

Existing server events, as naming models:

| Event                      | Emitted from                                                                 | Why server-side                            |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `signup`                   | `PostHogServerSideTracking.trackSignup` via `ServerSideTracking.trackSignup` | Only the auth callback knows `userCreated` |
| `fair_use_limit_reached`   | `front/lib/api/assistant/credit_cost.ts`                                     | Computed while billing the message         |
| `fair_use_limit_blocked`   | `front/lib/api/assistant/conversation.ts`                                    | Message refused before any UI state exists |
| `premium_model_downgraded` | `front/lib/api/assistant/premium_model_limit.ts`                             | Model resolution happens server-side       |
| `trigger_blocked`          | `front/temporal/triggers/activities.ts`                                      | No browser involved at all                 |

Pattern: the server owns **outcomes of policy** (limits, downgrades, blocks, provisioning), the
client owns **intent and exposure** (clicks, opens, views).

## Signup and identity stitching

`ServerSideTracking.trackSignup({ user, utmParams, anonymousId, userCreated })` is called from the
auth callback. On the PostHog side it:

1. `alias(user.sId <- anonymousId)` when an `_dust_aid` cookie was present, merging every
   pre-signup anonymous event into the new person
2. captures a `$set` with `first_name`, `last_name`, `name`, `provider` and current UTMs, plus
   `$set_once` `first_utm_*` for first-touch attribution
3. captures `signup` with `provider` and UTMs, only when `userCreated` is true

It deliberately does **not** call `client.identify()`: a server-side identify would mint a second
distinct id and split the person. The browser's `posthog.identify(user.sId)` does the merge.

`ServerSideTracking.trackGetUser` runs on login and only feeds Customer.io (workspace plan, seats,
subscription dates). Do not add PostHog calls there; login volume is high and PostHog already sees
the session from the client.

## Where to call it from

- Request handlers in `front-api`: after the mutation has succeeded or been refused, from the same
  branch that decides the outcome. Same rule as audit events: emit from the success or failure
  path, never speculatively before it.
- Temporal activities: fine, as long as the `Authenticator` gives you `user.sId` and the workspace
  `sId`. Use `auth.getNonNullableUser().sId` and `auth.getNonNullableWorkspace().sId`.
- Never from `front/lib/resources/*` or model layers. Tracking belongs to the API/activity layer
  that knows the business meaning of the change.
- Never for API-key or system actors without a real user: `distinctId` must be a person. If the
  actor is a key, either skip the event or key it on the workspace admin who owns the flow and
  say so in `extra.origin`.

## Testing

Spy on the static method and assert the payload:

```ts
const spy = vi
  .spyOn(PostHogServerSideTracking, "trackEvent")
  .mockImplementation(() => {});
// ... run the code path
expect(spy).toHaveBeenCalledWith({
  distinctId: user.sId,
  event: "trigger_blocked",
  workspaceId: workspace.sId,
  extra: { trigger_id: trigger.sId, error_type: "no_seat" },
});
```

Without `NEXT_PUBLIC_POSTHOG_KEY` the real method is already a no-op, so unspied tests do not
leak events.

## Configuration

| Setting | Where                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| API key | `NEXT_PUBLIC_POSTHOG_KEY` via `config.getPostHogApiKey()`; per-region values in `.github/configs/<region>/.env.*` |
| Host    | hard-coded `https://eu.i.posthog.com` (single EU project for both regions)                                        |
| Proxy   | `front-api/routes/subtle1.ts`, mounted at `/subtle1`, request logging skipped                                     |

Both the US and EU deployments write to the same PostHog project. Region-specific reporting is
done downstream in Metabase, not by splitting PostHog projects.
