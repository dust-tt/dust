# Metabase

Metabase is the reporting layer. It does not receive events directly: PostHog events and the
application databases are loaded into Snowflake, and Metabase questions and dashboards query
Snowflake. The code only ever links to Metabase; it never writes to it.

## Instances

| Region | URL                           | Used by                  |
| ------ | ----------------------------- | ------------------------ |
| US     | `https://metabase.dust.tt`    | default, most dashboards |
| EU     | `https://eu.metabase.dust.tt` | EU-region workspaces     |

Each Dust region has its own databases and therefore its own Metabase. When a question is about a
specific workspace, pick the instance matching the workspace's region. PostHog itself is a single
EU project shared by both regions, so PostHog-derived tables are the same on both sides while
application tables differ.

## Known dashboards and questions referenced in code

| What                                                                  | Where linked                                                                                     | Purpose                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Dashboard 34 "Snowflake workspace health", tab 30 "executive summary" | `front/components/poke/workspace/table.tsx`, `front/lib/api/actions/servers/poke/tools/index.ts` | Per-workspace health, opened from Poke with `workspace_id` prefilled |
| Question 637 (US) / 46 (EU) "whitelisted bots given connector"        | `front/lib/api/poke/plugins/data_sources/slack_whitelist_bot.ts`                                 | Slack bot whitelist lookup by `connectorId`                          |

When adding a Poke link to Metabase, follow `getMetabaseUrl` in `slack_whitelist_bot.ts`: branch on
region, pass filters as query params, keep the question ids in one helper.

## How a PostHog event shows up

Every event captured through `trackEvent` or `PostHogServerSideTracking.trackEvent` carries its
custom properties twice:

- spread flat at the top level of `properties`, which PostHog uses for filters and breakdowns
- as a single `extra` object, which is what Snowflake keeps as a structured column

So in Metabase, read custom properties from the `extra` variant column, for example
`extra:tool_name::string` or `extra:limit_credits::number` in Snowflake SQL. Do not depend on the
flat copies from Snowflake; they exist for PostHog.

Standard columns you can rely on for joins and segmentation:

| Need            | Column or property                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Which user      | `distinct_id` = `user.sId` (post-identify); pre-signup rows carry `dust_anonymous_id`                  |
| Which workspace | `$groups.workspace` = workspace `sId` (client after consent, server when `workspaceId` was passed)     |
| Which client    | `client_type` when the feature passes it (`web`, `extension`, ...); otherwise `user_agent`             |
| Attribution     | `utm_*`, `gclid`, `fbclid`, `msclkid`, `li_fat_id`, `$initial_*` / `first_*` person properties         |
| Plan            | workspace group properties `plan_code`, `plan_name`, `plan_type`, `is_trial` (set by admins' sessions) |

The client event name is `area:object:action`; split on `:` in SQL when you need the parts.
Server event names are flat.

## Choosing PostHog insight vs Metabase card

| Situation                                                                    | Use                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| One-off product question, last 90 days, only event data                      | PostHog insight (trend, funnel, retention)            |
| Recurring KPI, needs joins with billing, seats, subscriptions, or connectors | Metabase question on Snowflake                        |
| Per-workspace operational view for support                                   | Add to the workspace health dashboard, link from Poke |
| Cohort by plan or region                                                     | Metabase; PostHog only knows plan from admin sessions |

## Adding or changing a Metabase card, checklist

1. Confirm the event already lands in Snowflake with the expected `extra` keys (new events take a
   sync cycle to appear; do not build the card on the same day you ship the event).
2. Write the question in the instance matching the data's region, or once per instance when the
   metric is global.
3. Filter on workspace by `sId` and, for PostHog tables, by `$groups.workspace`. Never surface
   `ModelId`s or PII columns (emails, names, message content) on shared dashboards.
4. If the card backs a Poke link, add the URL through a region-aware helper like `getMetabaseUrl`.
5. Record the dashboard or question id in the PR description next to the tracking plan so the
   event and its consumer are reviewed together.

## What Metabase is not for

- Customer-facing analytics. Workspace admins see Elasticsearch-backed pages under
  `front/components/pages/workspace/Analytics*`; see `dust-elasticsearch`.
- Real-time debugging of an event you just added. Use PostHog live events.
- Lifecycle email or in-app messaging. That is Customer.io, fed from
  `front/lib/tracking/server.ts` and `front/lib/tracking/customerio/`.
