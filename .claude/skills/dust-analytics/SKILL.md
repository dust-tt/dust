---
name: dust-analytics
description: Add, change, or audit product analytics instrumentation in Dust (PostHog events from `front`, `front-spa`, `front-api`, `marketing`) and the Metabase dashboards built on top of them. Use when the user mentions tracking, PostHog, events, funnels, attribution, UTM, Metabase, dashboards, or "how do we measure X".
---

# Dust Product Analytics (PostHog + Metabase)

Dust instruments product usage with **PostHog** and reports on it with **Metabase**. This skill
covers the default path for adding or auditing an event and for finding the numbers afterwards.
Load the references only when you need the deeper mechanics.

- [references/posthog-client.md](references/posthog-client.md): browser SDK lifecycle, consent,
  identity, UTM/attribution, the `/subtle1` proxy.
- [references/posthog-server.md](references/posthog-server.md): `PostHogServerSideTracking`,
  signup/alias flow, workspace groups, when to track from the server.
- [references/metabase.md](references/metabase.md): where dashboards live, how PostHog events
  reach Metabase, how to read the `extra` column, region split.

## Mental Model

| Layer            | What it is                                                                            | Where                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Client events    | `trackEvent` / `withTracking` over `posthog-js`                                       | `front/lib/tracking.ts` (app), `marketing/lib/tracking.ts` (website)                     |
| Client bootstrap | Init, consent, identify, workspace group, pageviews                                   | `front/components/app/PostHogTracker.tsx`, `marketing/components/app/PostHogTracker.tsx` |
| Server events    | `PostHogServerSideTracking.trackEvent` over `posthog-node`                            | `front/lib/api/posthog.ts`, orchestrated by `front/lib/tracking/server.ts`               |
| Ingestion proxy  | `/subtle1` reverse proxy to `eu.i.posthog.com` (ad-blocker safe)                      | `front-api/routes/subtle1.ts`                                                            |
| Warehouse        | PostHog events land in Snowflake; the `extra` property is kept as one object for that | see `trackEvent` comments                                                                |
| Reporting        | Metabase dashboards and questions on Snowflake                                        | `metabase.dust.tt` (US), `eu.metabase.dust.tt` (EU)                                      |

Not this skill: the in-product **workspace Analytics pages** (`front/components/pages/workspace/
Analytics*`) are an Elasticsearch-backed feature for customers. Use `dust-elasticsearch` for those.
`TRACKING_AREAS.ANALYTICS` is only the PostHog area name for instrumenting that feature's UI.

## Default Workflow

### 1. Start from the decision, not the event

Write down, in one line each:

- the question ("do users who open the model picker pick a non-default tier?")
- the decision it informs ("keep or drop the discovery glint")
- where the answer will be read (PostHog insight, existing Metabase dashboard, new question)

If no decision depends on it, do not add the event. Check what already exists first:
`git grep -n "trackEvent({" front/components` and `git grep -n "PostHogServerSideTracking" front`.

### 2. Pick client or server

- **Client** (`trackEvent`, `withTracking`): user gestures and UI exposure. Clicks, opens, selects,
  form submits, views of a surface. Runs only when `posthog.__loaded` is true, so it silently
  no-ops in tests, excluded paths and before init.
- **Server** (`PostHogServerSideTracking.trackEvent`): outcomes the browser cannot see or that must
  be counted even without a browser. Blocked actions, limits reached, downgrades, triggers,
  signup. Always pass `workspaceId` so the event resolves to the workspace group.

Never use `posthog.capture` or `usePostHog` directly in app code. The two legacy exceptions
(`SharedFramePage`, `EmailVerificationFlow`) predate the helpers; do not copy them.

### 3. Name the event

Client events are named for you: `${area}:${object}:${action}`.

- `area` must come from `TRACKING_AREAS`. Add a new key there if a real new product surface
  appears; do not invent free-form areas.
- `object` is `snake_case`, specific, and stable: `model_picker`, `create_agent`, `tool_select`.
  Put variants in properties, not in the object (`tool_select` + `tool_name`, not
  `tool_select_slack`).
- `action` comes from `TRACKING_ACTIONS` (`click`, `submit`, `create`, `delete`, `connect`,
  `select`, `open`, `close`, `view`). Default is `click`.

Server events are flat `snake_case` outcome names: `fair_use_limit_blocked`,
`premium_model_downgraded`, `trigger_blocked`, `signup`. Name the outcome, not the code path.

When one feature emits several related events, centralize them in a `<feature>Tracking.ts` module
with typed helpers and a shared base `extra` (see `front/components/model_picker/
modelPickerTracking.ts`). Bump a `campaign_id` constant there when a discovery campaign restarts.

### 4. Shape the properties

`extra` is `Record<string, string | number | boolean>` and is sent twice: spread flat for PostHog
filters, and as one `extra` object for Snowflake. Therefore:

- keys are `snake_case`, values are scalars, no nesting
- identifiers are `sId`s (`agent_id`, `tool_id`, `workspace_id`, `trigger_id`), never `ModelId`
- no PII: no emails, names, message content, prompts, file names, or free text typed by users
- no duplicates of what PostHog adds itself (`$current_url`, `$referrer`, UTM params, `user_agent`
  and `dust_anonymous_id` are injected in `before_send`)
- money and time carry unit suffixes (`limit_credits`, `duration_ms`), matching `[GEN9]`
- prefer a small enum-like string over a boolean when a third state is plausible
  (`selection_kind: "tier" | "model"` rather than `is_tier`)

### 5. Add the call

Client, simple click:

```tsx
<Button
  onClick={withTracking(TRACKING_AREAS.BUILDER, "create_agent", handleCreate)}
/>
```

Client, non-click or with properties:

```ts
trackEvent({
  area: TRACKING_AREAS.TOOLS,
  object: "tool_select",
  action: TRACKING_ACTIONS.SELECT,
  extra: { tool_id: serverView.sId, tool_name: serverView.server.name },
});
```

Client, exposure of a surface (fire once per mount, in an effect keyed on the ids):

```ts
useEffect(() => {
  trackEvent({
    area: TRACKING_AREAS.ANALYTICS,
    object: "analytics_page",
    action: TRACKING_ACTIONS.VIEW,
    extra: { workspace_id: owner.sId },
  });
}, [owner.sId]);
```

Server:

```ts
PostHogServerSideTracking.trackEvent({
  distinctId: user.sId,
  event: "trigger_blocked",
  workspaceId: auth.getNonNullableWorkspace().sId,
  extra: { trigger_id: trigger.sId, error_type: errorType },
});
```

Server calls must stay off the critical path: they are fire-and-forget, never awaited, never
allowed to fail the request. `PostHogServerSideTracking` already catches and logs internally.

### 6. Test the contract, not PostHog

Mock only the emit and assert the event shape, keeping the real areas and actions:

```ts
vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: vi.fn() };
});
expect(vi.mocked(trackEvent)).toHaveBeenCalledWith({
  area: "assistant", object: "model_picker", action: "open", extra: { surface: "conversation_input_bar", ... },
});
```

Model: `front/components/model_picker/modelPickerTracking.test.ts`. For server helpers, spy on
`PostHogServerSideTracking.trackEvent` the same way. Never hit the network in tests.

### 7. Verify in PostHog, then land it in Metabase

1. Run the flow locally with `NEXT_PUBLIC_POSTHOG_KEY` set and open PostHog's live events view
   (EU project). Check the event name, the flat properties, and that `$groups.workspace` is set.
2. Check that no excluded path (`/poke`, `/sso-enforced`, `/maintenance`, `/oauth/`) emitted it.
3. If the question is a one-off, answer it with a PostHog insight and stop.
4. If it feeds an ongoing decision, add a question or a card to the relevant Metabase dashboard
   on Snowflake. See [references/metabase.md](references/metabase.md) for how the `extra`
   object is queried and which instance (US or EU) to use.

## Core Rules

- One helper per layer: `trackEvent` / `withTracking` on the client,
  `PostHogServerSideTracking.trackEvent` on the server. No raw SDK calls in features.
- `area` from `TRACKING_AREAS`, `action` from `TRACKING_ACTIONS`, `object` in `snake_case`.
- Properties are flat scalars, `snake_case`, `sId`s only, no PII, units in names.
- Every server event carries `distinctId: user.sId` and `workspaceId`.
- Consent is handled centrally in `PostHogTracker`. Feature code never checks cookies or calls
  `opt_in_capturing` / `identify` / `group` itself.
- Identity is `user.sId` on both sides. Server code never calls `identify`; it aliases the
  `_dust_aid` anonymous id at signup so pre-signup events merge into the person.
- Attribution (UTM, click ids, `posthog_id`, landing context) is captured once by the tracker and
  injected on every event. Do not re-read `window.location` for it in features.
- The `marketing` workspace has a parallel `lib/tracking.ts` with the same API. Keep the two in
  sync when changing the contract.
- Do not add a new analytics vendor or SDK. PostHog is the event store, Customer.io is only fed
  from `ServerSideTracking` for lifecycle email, Metabase is the reporting layer.

## Anti-Patterns

| Seen                                                                   | Do instead                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `posthog.capture("thing_happened", {...})` in a component              | `trackEvent({ area, object, action, extra })`         |
| Variant baked into the name (`tool_select_slack`)                      | `tool_select` + `extra.tool_name`                     |
| `extra: { agent: agentConfiguration }` (nested object)                 | `extra: { agent_id: agentConfiguration.sId, scope }`  |
| `extra: { email: user.email }`                                         | drop it; the person is already identified by `sId`    |
| Server event without `workspaceId`                                     | always pass it so the workspace group resolves        |
| `await PostHogServerSideTracking.trackEvent(...)` in a request handler | fire-and-forget, keep the return type `void`          |
| A new `TRACKING_AREAS` key for a single button                         | reuse the surface's area, differentiate with `object` |
| Firing `view` on every re-render                                       | fire once in an effect keyed on the stable ids        |
| Copying `isTrackablePathname` checks into a feature                    | the tracker filters excluded paths per event          |

## Output Format: Tracking Plan

When asked to plan instrumentation for a feature, deliver this table before writing code, and
keep it in the PR description.

```markdown
# <Feature> tracking plan

Decision: <what this data will change>
Read in: PostHog insight <link or name> / Metabase dashboard <name> (US, EU)

| Event                       | Side   | Trigger                           | Properties                                                 | Notes           |
| --------------------------- | ------ | --------------------------------- | ---------------------------------------------------------- | --------------- |
| assistant:model_picker:open | client | picker opened from input bar      | surface, campaign_id, client_type                          | once per open   |
| premium_model_downgraded    | server | rate limit forces a cheaper model | limit_messages, requested_model_id, downgraded_to_model_id | fire-and-forget |
```

## Task-Specific Questions

Ask only what the code and the request do not already answer:

1. What decision does this measurement change, and when will it be read?
2. Is the moment visible in the browser, or only known server-side?
3. Which existing area does the surface belong to?
4. Does the answer need a persistent Metabase card, or is a PostHog insight enough?
5. Is any of the requested data PII or user content? If so, what non-PII proxy answers the question?
