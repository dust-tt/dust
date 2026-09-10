# Skill search

This document describes the full skills-only stack. Resource-owned mutation
indexation is introduced by the lifecycle follow-up.

PostgreSQL is authoritative. One document per active custom skill lives in
`front.skills`, backed by `front.skills_2`. Document IDs are
`<workspaceId>_<skillId>`. Global and system skills remain code-defined and are
merged at query time: changing their definitions requires no ES migration.

## Mapping

| Fields | Mapping |
| --- | --- |
| `workspace_id`, `skill_id`, `status`, `availability` | `keyword` |
| `name` | `text`, `keyword`, `search_as_you_type` (`name.autocomplete`) |
| `description` | `text` |
| `requested_space_ids`, `editors`, `editor_group_ids`, `tools` | `keyword` arrays |
| `icon`, `edited_by`, `updated_at` | `keyword`, `long`, `date` |
| `active_users`, `favorite_count`, `is_default` | `integer`, `integer`, `boolean` |
| `metadata` | source-only object, `enabled: false` |

All requested spaces, including projects/pods, use the same field. Duplicate,
missing or foreign-workspace references invalidate a document. Tools are MCP
server view sIds; editor user/group IDs are internal IDs resolved by Authenticator.
Individual editors are projected from their auto group. Other editor groups are
stored without expanding every member into an indexed viewer list.

Name and description analysis splits punctuation and camel/Pascal-case boundaries,
then lowercases tokens without stemming or stop-word removal. The same small
tokenizer runs for code-defined skills, keeping recall and scores comparable.
For example, `WeeklyReportBot` tokenizes as `weekly`, `report`, `bot`.

Metadata supplies the remaining stripped skill fields for `SkillResource`
hydration. Instructions, tool configurations and files are never indexed.
The projector reads the row and relations in one repeatable-read transaction.

## Authorization

Every ES search filters `workspace_id` and active status. Strict search requires:

- All requested spaces must be readable. Empty requirements match directly;
  otherwise `terms_set` requires `doc['requested_space_ids'].size()` matches.
- Published availability, or a matching individual/group editor grant for
  editors-only skills. Type-wide write grants and the existing API-key visibility
  exception retain their canonical semantics.

Readable spaces and editor groups come from the hydrated Authenticator, without
another space-list query. Open spaces/pods are included through global-group read
grants. An admin role alone does not imply access to every space. A type-wide read
grant avoids enumerating IDs; otherwise query size scales with the caller's grants.

Candidates are validated in batches against PostgreSQL: lifecycle, row-read
permission, every requested space, availability and current editor grants. Stale
permission fields fail closed. There is no per-skill SQL query or candidate-pod
special case. A PIT freezes index state, never authorization.

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
- `discovery`: text score plus `log1p(active_users)`. Matching every complete query
  word in the description scores 20. This formula still needs product validation.

There are no wildcard/subsequence clauses: `report b` finds `WeeklyReportBot`,
but `sand` no longer finds `Search And Navigate Data`. Punctuation is not query
syntax, and description-only matches never enter autocomplete results.

Comma-separated `spaceIds`, `toolIds` and `availability` use OR within a dimension
and AND across dimensions. `isDefault` and `editedByMe` accept true/false. These
selection filters never replace ACLs and apply to code-defined skills too.

ES and TypeScript share fixed scores, float32 precision and name/ID byte-order
tie-breakers. Empty text matches all eligible skills. A page merges ES hits with
the code-defined catalog. Its opaque Redis cursor stores a PIT, the last consumed
ES sort tuple and a separate catalog offset. Globals displacing an ES hit never
advance past that hit, so it remains available on the next page.

Cursors expire after five minutes and are bound to workspace, caller, query,
mode, filters, permissions and catalog. Each page can recall at most five batches
of 50–200 candidates; heavy post-filtering can produce a short page with a cursor.

## Lifecycle and maintenance

Skill mutation methods own indexation. They complete their DB transaction before
enqueueing a per-skill Temporal workflow. An explicit enclosing transaction
defers enqueueing until its ancestors commit; rollback suppresses it. The activity
rebuilds the latest committed document or deletes an inactive/invalid one.

Editor grant and group-membership mutations enqueue only affected workspace
skills. Group deletion captures targets before removing grants. Ordinary space
membership changes do not reindex skills: authorization is checked live. Skill
space requirements, content, tool attachments, favorites and reinforcement metadata
are indexed through resource mutations, not duplicated route hooks.

Daily usage counts distinct users over the previous 30 complete UTC days. Updates
are workspace-scoped and paginated; absent counts reset to zero. Ordinary document
refreshes preserve this snapshot. Code-defined usage is stored per workspace in
Redis. `scripts/refresh_search_usage.ts` supports one workspace or the regional
daily schedule, with dry-run behavior unless `--execute` is supplied.

`scripts/backfill_skill_search.ts` rebuilds skills through the same workflows.
Workspace scrub deletes its documents; relocation clears and rebuilds the
destination. Version 2 replaces the wildcard fields and renames `editor_user_ids`
to `editors`; it requires rebuilding the index, not updating a live mapping.
Version 1 files remain for the earlier PRs in the stack.

For an existing PoC installation, keep search disabled and drain the old indexation
workers during the cutover. Create version 2 with `create_elasticsearch_index.ts`
using `--index-name skills --index-version 2 --remove-previous-alias --execute`,
deploy the matching writers, then run `backfill_skill_search.ts`. Wait for Temporal and
ES refresh, refresh usage, and validate before re-enabling search. Do not point
the alias at both versions: that would duplicate results. Existing cursors are
invalidated by the new query/fingerprint version. No live index is migrated by
this code change alone.

There is no transactional outbox. A lost Temporal launch can leave stale or missing
documents until another mutation or repair. ES refresh adds eventual-visibility
delay. Deployment needs explicit repair and visibility SLOs; query cost and large
resolved grant sets still need production-scale measurement.

## Scope of the simplified stack

The implementation is skills-only: no agent index, agent lifecycle refactor,
combined endpoint or generic resource-search base class. ES operations are plain
skill helpers. The broad transaction foundation is unnecessary: only a local
post-commit enqueue helper and an isolation-level option for projection reads remain.
