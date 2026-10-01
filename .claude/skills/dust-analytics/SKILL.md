---
name: dust-analytics
description: Track user interactions in PostHog while implementing features in `front`, so their usage can be analysed later. Use when adding or changing a user-facing feature, flow, or surface, or when the user mentions tracking, PostHog, events, or "how do we measure X".
---

# Product analytics (PostHog)

A user-facing feature ships with the events needed to analyse how it is used. Add them in the same
change as the feature, not as a follow-up.

## What to track

Track the moments someone will ask about later:

- a surface is shown (`view`, `open`)
- a user acts on it (`click`, `select`, `submit`, `dismiss`, `close`)
- the outcome of that action (`create`, `delete`, `connect`), and outcomes only the server knows
  (a limit hit, a request refused, a model downgraded)

Do not track UI plumbing (hover, scroll, re-render). Check what the feature already sends before
adding: `git grep -n "trackEvent\|withTracking" front/components/<feature>`.

## Client events

Use `trackEvent` or `withTracking` from `@app/lib/tracking`, never `posthog` directly. The event
name is built as `${area}:${object}:${action}`:

- `area`: from `TRACKING_AREAS`, the product surface. Add a key only for a real new surface.
- `object`: `snake_case`, stable, names the thing acted on (`model_picker`, `suggestion_card`).
  Put variants in `extra`, not in the object.
- `action`: from `TRACKING_ACTIONS`, defaults to `click`.

```tsx
<Button onClick={withTracking(TRACKING_AREAS.BUILDER, "create_agent", handleCreate)} />

trackEvent({
  area: TRACKING_AREAS.TOOLS,
  object: "tool_select",
  action: TRACKING_ACTIONS.SELECT,
  extra: { tool_id: serverView.sId },
});
```

A feature with several events gets one `<feature>Tracking.ts` module next to its components, with
one typed helper per event. Components call the helpers. Models:
`front/components/model_picker/modelPickerTracking.ts`,
`front/components/markdown/suggestion/suggestionTracking.ts`.

Views fire from an effect, once per mount. For a list whose items change state, remember the ids
already seen in a ref so each item counts once (model: `useTrackSuggestionCardViews`):

```ts
const seenIds = useRef(new Set<string>());
useEffect(() => {
  for (const item of items) {
    if (!seenIds.current.has(item.id)) {
      seenIds.current.add(item.id);
      trackItemView(item.id);
    }
  }
}, [items]);
```

## Server events

Use `PostHogServerSideTracking.trackEvent` from `@app/lib/api/posthog` for outcomes the browser
cannot see. Name the outcome in flat `snake_case` (`premium_model_downgraded`), always pass
`distinctId: user.sId` and `workspaceId`, and never await it: tracking must not slow down or fail
the request.

```ts
PostHogServerSideTracking.trackEvent({
  distinctId: user.sId,
  event: "trigger_blocked",
  workspaceId: workspace.sId,
  extra: { trigger_id: trigger.sId },
});
```

## Properties

`extra` is a flat `Record<string, string | number | boolean>`, sent both spread for PostHog and as
one object for Snowflake.

- Carry the id that joins the event to the data it will be analysed with (`batch_id`,
  `agent_id`), or every id for an action on several items (`batch_ids`). If that id is not
  available where the event fires, skip the event.
- Ids are `sId`s, never `ModelId`s. Keys are `snake_case`, units are in the name (`duration_ms`).
- No PII and no user content: no emails, names, messages, prompts, file names, or typed text.
- Do not repeat what is added for every event (URL, referrer, UTM, user and workspace).
- Prefer a small string enum over a boolean when a third value is plausible
  (`surface: "pile" | "single"` rather than `in_pile`).

## Contracts and tests

When analysis relies on a guarantee about events (every event carries a join key, a view is
counted once), state it as a `@cc` contract on the tracking helper (see the `code-contracts`
skill).

Test the helpers by mocking only the emit and asserting the exact event:

```ts
vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: vi.fn() };
});
```

For a view hook, `renderHook` it, `rerender` with the same and with changed items, and assert the
call count. Model: `front/components/markdown/suggestion/suggestionTracking.test.ts`. For server
events, mock `PostHogServerSideTracking.trackEvent` the same way.
