# Manage Agents and Skills analytics

Filter on `entity_type = agent` or `skill`. Every event below carries
`manage_session_id` for one page visit and `search_id` for one query/filter/tab
combination. Search text and filter values are never sent.

## Do people find what they need?

Build a funnel from `builder:manage_results:view` with `outcome = success` to
`builder:manage_details:open`, holding `search_id` constant. Include
`builder:manage_action:click` as an alternative second step: people can edit or
duplicate directly from a row without opening its details.

- Break down by `entity_type`, `tab`, `has_search` and `filter_categories`.
- Measure zero-result rate with `result_count = 0` among successful result events.
- Count distinct `search_id` values per `manage_session_id` to measure reformulation.
- A visit with results and no detail open or item action is a candidate abandonment.
  This is a behavioral proxy, not proof that the user failed to find something.

Results are emitted after loading, once per result set. Pagination and refreshes
do not add result events. Errors carry `outcome = error` and no result count;
a successful retry can emit a success for the same `search_id`. Clicks on retained
rows during loading keep the previous result set's attribution.

## What do they do next?

Build a funnel from `builder:manage_details:open` to `builder:manage_action:click`
or `builder:manage_action:submit`, holding `search_id` constant. Break down the
second step by `operation`. For actions on the same single item, also hold
`target_id` constant.

Clicks cover edit, duplicate, try/chat, copy and export. Submit events cover
confirmed archive, favorite/unfavorite, availability, model/tag updates, imports
and default-agent enable/disable. `target_id` identifies a clicked item;
`target_ids` is a comma-separated list for mutations, with `target_count`.
Single-item mutations also include `target_id`.

For bulk model/tag updates and skill imports, only confirmed IDs are counted;
`skipped_count` records skipped items. Legacy scope updates and individual agent
tag updates return no per-item confirmation, so their outcome is `accepted`
and their IDs are the requested targets. Do not count these as confirmed writes.

Creation entry points use `builder:manage_create:click` with `method` equal to
`menu`, `scratch`, `template`, `yaml` or `import`. Existing builder open/save events
continue separately; they do not carry these Manage visit/result IDs.

`builder:manage_page:view`, `builder:manage_tab:select` and
`builder:manage_filter:select` provide visit and navigation context. Read-only
Poke listings and actions outside Manage do not emit these events.
