# PostHog Client Side

Everything the browser does with PostHog goes through two files. Feature code only ever calls the
first one.

- `front/lib/tracking.ts`: `TRACKING_AREAS`, `TRACKING_ACTIONS`, `trackEvent`, `withTracking`.
- `front/components/app/PostHogTracker.tsx`: init, consent, identify, workspace group, pageviews.

The `marketing` workspace mirrors both under `marketing/lib/tracking.ts` and
`marketing/components/app/PostHogTracker.tsx` because the public site is a separate bundle. A change
to the event contract must be made in both.

## Mounting

- `front-spa/src/app/App.tsx` mounts `<PostHogTracker authenticated>`: the user is logged in, so
  consent is assumed and persistence is `localStorage+cookie` from the start.
- `front-spa/src/share/ShareApp.tsx` and the marketing site mount `<PostHogTracker>` without
  `authenticated`: consent comes from the `dust-cookies-accepted` cookie.

The provider is always rendered so that toggling consent never remounts the app tree.

## Init (Phase 1)

`posthog.init` runs once per page load when `NEXT_PUBLIC_POSTHOG_KEY` is set and the path is
trackable. Key settings and why they are what they are:

| Option                             | Value                                                            | Reason                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `api_host`                         | `${apiBaseUrl}/subtle1`                                          | Reverse proxy in `front-api/routes/subtle1.ts` to `eu.i.posthog.com`; the obfuscated name avoids ad blockers                    |
| `person_profiles`                  | `identified_only`                                                | Anonymous visitors do not create persons until `identify`                                                                       |
| `persistence`                      | `sessionStorage` pre-consent, `localStorage+cookie` post-consent | Keeps `$sesid` stable across loads without dropping cookies before consent                                                      |
| `bootstrap.distinctID`             | `_dust_aid` value, pre-consent only                              | Anonymous events share one id across `dust.tt` and `app.dust.tt`; never bootstrap post-consent or it clobbers the identified id |
| `cookie_domain`                    | `.dust.tt` in prod                                               | Identity survives `dust.tt` -> signin -> `app.dust.tt`                                                                          |
| `capture_pageview`                 | `history_change`                                                 | SPA navigations count as pageviews; `?q=` style updates do not                                                                  |
| `autocapture`, `capture_pageleave` | off                                                              | Only explicit events; keeps volume and Snowflake cost predictable                                                               |
| `disable_session_recording`        | true at init, enabled post-consent                               | Recording is masked (`maskAllInputs`, `maskTextSelector: "*"`)                                                                  |
| `property_denylist`                | `["$ip"]`                                                        | No IP storage                                                                                                                   |

Excluded paths (init and per-event): `/poke`, `/poke/`, `/sso-enforced`, `/maintenance`,
`/oauth/`. Add to `EXCLUDED_PATHS` if a new internal or auth surface must never emit.

## `before_send`

Runs on every event and is the single place where cross-cutting properties are added:

- drops `$pageview` on excluded paths
- injects stored marketing params (`utm_*`, `gclid`, `fbclid`, `msclkid`, `li_fat_id`,
  `posthog_id`) from sessionStorage/cookies, because `useStripUtmParams` removes them from the URL
  before PostHog sees it
- fixes `$set_once.$initial_*` so stripped UTMs do not lock in `null`, and injects first-touch
  landing context (`$initial_referrer`, `$initial_host`, `$initial_current_url`, `$initial_pathname`)
- injects `dust_anonymous_id` from the `_dust_aid` cookie, `$referrer`, and `user_agent`
- on `$pageview`, reads `<meta name="dust:is_seo_article">` style flags into properties

Consequence for feature code: do not re-add any of these to `extra`.

## Identify

`posthog.identify(user.sId)` fires as soon as the user is known, before the persistence upgrade,
and is **not** gated on consent (identifying an authenticated user is first-party). If a
`posthog_id` query param was carried in from the marketing site it is aliased to the user. First-touch
attribution is written once with `setPersonProperties({}, { first_utm_source, first_referrer, ... })`.

Identity is `user.sId` everywhere: client `identify`, server `distinctId`, Snowflake, Metabase joins.

## Consent upgrade (Phase 2)

When `dust-cookies-accepted` becomes true mid-visit, the tracker switches persistence to
`localStorage+cookie`, starts session recording, and registers `dust_anonymous_id` as a super
property. Feature code never calls `opt_in_capturing`, `opt_out_capturing`, or `set_config`.

## Workspace group

When a `wId` is in the route and consent is granted, `posthog.group("workspace", wId, props)` is
called. Plan properties (`plan_code`, `plan_name`, `plan_type` in `FREE | PRO | ENTERPRISE | OTHER`,
`is_trial`) are attached only when the current user is an admin, since only admins can read the
subscription. `user_role` is set as a person property.

This is why server events must pass `workspaceId`: it becomes `groups.workspace` and lets PostHog
and Metabase attribute the event to the same workspace entity as client events.

## Attribution utilities

- `front/lib/utils/utm.ts`: `MARKETING_PARAMS`, `extractUTMParams`, cookie persistence for click
  ids with per-platform expiry (`gclid` 90d, `msclkid` 90d, `li_fat_id` 30d, `fbclid` 7d), UTM
  cookies 30d.
- `front/lib/utils/anonymous_id.ts`: `_dust_aid` cookie (1 year, `.dust.tt` in prod), the
  cross-subdomain device id that lets pre-signup events merge into the person at signup.
- `front/lib/tracking/campaigns.ts`: canonical UTM sets for Dust-owned links (for example
  `FOR_YOU_EMAIL_UTM`). Add a constant here rather than hand-writing `utm_*` in a template.

## Adding a client event, checklist

1. Area exists in `TRACKING_AREAS`, or a real new surface justifies a new key (add it to both
   `front` and `marketing` if the surface exists on both).
2. `object` is `snake_case` and stable, `action` from `TRACKING_ACTIONS`.
3. `extra` is flat, scalar, `sId`-based, no PII, no duplicates of `before_send` properties.
4. Exposure events fire once per mount via `useEffect` keyed on stable ids.
5. Multi-event features get a `<feature>Tracking.ts` with typed helpers and a test that mocks only
   `trackEvent`.
