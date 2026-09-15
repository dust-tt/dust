# Skill search

PostgreSQL is authoritative. One document per active or archived custom skill lives in
`front.skills`, backed by `front.skills_1`. Document IDs are
`<workspaceId>_<skillId>`. Global and system skills remain code-defined and are
merged at query time: changing their definitions requires no ES migration.

## Mapping

| Fields | Mapping |
| --- | --- |
| `workspace_id`, `skill_id`, `status`, `availability` | `keyword` |
| `name` | `text`, `keyword`, `search_as_you_type` (`name.autocomplete`) |
| `description` | `text` |
| `requested_space_ids`, `editor_ids`, `mcp_server_view_ids` | `keyword` arrays |
| `icon`, `last_edited_by_user_id` | `keyword` |
| `created_at`, `updated_at` | `date` |
| `active_users_count`, `favorite_count` | `integer` |

All requested spaces, including manually selected spaces and projects/pods, use
`requested_space_ids`; manual selections are already part of the canonical
`requestedSpaceIds` union. Normal resource fetching enforces workspace and requested-space
access before indexing. Tools are MCP
server view sIds; editor IDs are user sIds matched against `auth.user().sId`.
Individual editors are projected from their auto group; editor group IDs are not indexed.
The last editor is resolved separately from the skill's `editedBy` user to its sId,
including when that user is no longer an editor. Missing users produce `null`.

`name` uses a keyword tokenizer followed by `icu_folding` for a case- and
accent-insensitive whole-name match. `name.keyword` stays raw for deterministic
sorting. `name.autocomplete` first normalizes to NFC without changing case, then
uses `icu_tokenizer` and `skill_name_preserve_words` to split camel/Pascal-case boundaries.
`icu_folding` runs last so case boundaries are still available during splitting.
`name.autocomplete_preserved` uses the ICU analyzer without case splitting.
Both streams are queried together: `GitHub` is searchable as `git`, `hub`, and
`github`. Separate streams avoid overlapping tokens, which the generated
search-as-you-type shingle fields cannot index. Description uses the ICU analyzer.
Neither analyzer stems or removes stop words. The Elasticsearch ICU analysis
plugin is required.

Code-defined skills keep lightweight local matching, without an additional ES
analysis request. They share score tiers with indexed skills, but their
tokenization and Unicode folding are not guaranteed to match ICU.

Creation and update times are indexed dates. Agent-facing descriptions,
source/import details and reinforcement settings remain in PostgreSQL; there is
no metadata payload in `_source`. After authorization, `SkillResource` serializes
the listing from the resource already fetched for validation. The existing API's
numeric `editedBy` remains unchanged; the ES field contains the user's string sId.
`SkillListItemType` is the listing-only shape: identity, name,
description, icon, last editor, requested spaces, status and readability. Search
adds a score; the fuller skill types remain reserved for consumers that need
builder or execution data. Instructions, tool configurations and files are never indexed.
Indexing calls the normal resource fetchers and passes the editor and last-editor resources
to the synchronous `SkillResource.toSearchDocument`, which extracts their sIds.
There is no search-specific fetcher or asynchronous serializer.

## Authorization

Every ES search filters `workspace_id` and the requested statuses, defaulting to active.
Suggested skills are never indexed. Strict search requires:

- All requested spaces must be readable. Empty requirements match directly;
  otherwise `terms_set` requires `doc['requested_space_ids'].size()` matches.
- Published availability, or a matching editor user ID for
  editors-only skills. Type-wide write grants and the existing API-key visibility
  exception retain their canonical semantics.

Readable spaces and the caller's user ID come from the hydrated Authenticator, without
another space-list query. Open spaces/pods are included through global-group read
grants. An admin role alone does not imply access to every space. A type-wide read
grant avoids enumerating IDs; otherwise query size scales with the caller's grants.

Candidates are validated in batches against PostgreSQL: lifecycle, row-read
permission, every requested space, availability and current editor grants. Validation
compares status, availability and requested spaces without loading tools or rebuilding search
documents. Differences in the complete editor list do not reject a result: editors-only
skills still require the caller's current write permission. There is no per-skill SQL
query or candidate-pod special case. A PIT freezes index state, never authorization.

Admins may request `permissionFiltering=redact_unreadable`. ES keeps workspace,
status and selection filters, but omits visibility gates. The canonical resource
reader returns listing metadata with `canRead: false` for unreadable entries.
This grants no read, edit or execution access. Non-admin requests receive 403.

## Endpoint, ranking and pagination

`GET /api/w/:wId/skills/search` preserves `{ skills, nextCursor }` and accepts
`query`, `limit` (1–150), `cursor`, `permissionFiltering` and `mode`:

- `autocomplete` (default): name/alias only. Exact name, whole-name prefix and
  word-prefix matches score 100, 80 and 60. A `bool_prefix` query targets
  `name.autocomplete` and its shingle subfields, requiring all complete words and
  a prefix match for the last word, in any order. Usage does not affect slash ordering.
- `management`: name/description recall, sorted by active users then name.
- `discovery`: text score plus `log1p(active_users_count)`. Matching every complete query
  word in the description scores 20. This formula still needs product validation.

There are no wildcard/subsequence clauses: `report b` finds `WeeklyReportBot`,
but `sand` no longer finds `Search And Navigate Data`. Punctuation is not query
syntax, and description-only matches never enter autocomplete results.

Comma-separated `status`, `spaceIds`, `toolIds` and `availability` use OR within a dimension
and AND across dimensions. `isDefault` and `editedByMe` accept true/false.
`isDefault` filters by `availability: users_and_agents`, without a separate indexed field.
These selection filters never replace ACLs and apply to code-defined skills too.
`status=archived` searches archives; `status=active,archived` searches both. Omitting
status keeps slash/discovery results active-only. Code-defined skills are always
active and never appear in archive-only results. Changing status requires a new cursor.
Each result includes its status so mixed listings can distinguish active and archived skills.

ES and TypeScript share fixed scores, float32 precision and name/ID byte-order
tie-breakers. Empty text matches all eligible skills. A page merges ES hits with
the code-defined catalog. Its opaque Redis cursor stores a PIT, the last consumed
ES sort tuple and a separate catalog offset. Globals displacing an ES hit never
advance past that hit, so it remains available on the next page.

Cursors expire after five minutes and are bound to workspace, caller, query,
mode, filters, permissions and catalog. Each page can recall at most five batches
of 50–200 candidates; heavy post-filtering can produce a short page with a cursor.

## Lifecycle and maintenance

Skill mutation methods own indexation, enqueueing a per-skill Temporal workflow
after their existing writes. Transaction boundaries and mutation APIs are unchanged.
Operations passed a transaction leave indexation to the owning resource after its
writes complete; there are no search-specific commit hooks. The activity
fetches the skill through `SkillResource.fetchByIds`, loads its editors and last editor,
and indexes the synchronous `toSearchDocument` result. Missing, unreadable or suggested
skills are deleted from the index. Archive and restore update the indexed
status; a name collision during archive also refreshes the older renamed archive.

Editor additions, upserts and removals enqueue a refresh through `SkillResource`.
Group, workspace-membership and space-permission changes do not trigger skill reindexing:
authorization is checked live. Newly granted access absent from `editor_ids` may stay
hidden by the ES filter until the next skill refresh. Skill
space requirements, content, tool attachments, favorites and reinforcement metadata
are indexed through resource mutations, not duplicated route hooks.

Daily usage counts distinct users over the previous 30 complete UTC days. Updates
are workspace-scoped and batched; absent counts reset to zero. Ordinary document
refreshes preserve this snapshot. Code-defined usage is stored per workspace in
Redis. `scripts/refresh_search_usage.ts` supports one workspace or the regional
daily schedule, with dry-run behavior unless `--execute` is supplied.

`scripts/backfill_skill_search.ts` uses `SkillResource.listByWorkspace` to list custom
active and archived skills, then enqueues the same workflows with bounded concurrency.
Usage refresh and relocation reuse the same workspace listing instead of a search-specific pager.
Workspace scrub deletes its documents; relocation clears and rebuilds the
destination. The first index version contains the complete mapping, including
autocomplete, editor grants, tools and usage fields.

Create the index with `create_elasticsearch_index.ts` using
`--index-name skills --index-version 1 --execute`, deploy the matching writers,
then run `backfill_skill_search.ts`. Wait for Temporal and ES refresh, refresh
usage, and validate before enabling search. Fresh dev-container and dust-hive
setups create this same index automatically. No live index is created by deploying
the application code alone.

PoC indices with the former `editors`, `edited_by`, `tools`, or `active_users`
field names need a fresh index and backfill before using these readers and writers.

There is no transactional outbox. A lost Temporal launch can leave stale or missing
documents until another mutation or repair. ES refresh adds eventual-visibility
delay. Deployment needs explicit repair and visibility SLOs; query cost and large
resolved grant sets still need production-scale measurement.

## Scope of the simplified stack

The implementation is skills-only: no agent index, agent lifecycle refactor,
combined endpoint or generic resource-search base class. ES operations are plain
skill helpers. Existing transaction boundaries, locks, and SQL helpers are unchanged.
Mutation owners enqueue indexation after their writes without a search-specific commit helper.
