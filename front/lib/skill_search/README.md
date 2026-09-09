# Shared skill and agent search

PostgreSQL is authoritative. Custom skills have one document per logical skill in
`front.skills`, initially backed by `front.skills_1`, with document ID
`<workspaceId>_<skillId>`. Global/system skills and global agents stay code-defined and
need no ES migration. Workspace agents use `front.agents`, initially backed by
`front.agents_1`. Both resource types own their mutation and indexing paths.

Agent configuration reads, listing views and serialization now live on `AgentResource`,
with compatibility functions for existing callers. Favorites and action serialization
belong to their relationship resources. Creation commits the configuration, grants, tags, tools
and skills together, and upgrades lock the stable agent identity. Tool relationships
and tag writes are batched; tag and editor-group reads use the creation transaction.
Auth refresh, cache invalidation, audit and trigger effects wait until
commit, including when a caller owns an outer transaction. Agent indexing is wired
for create/version changes, archive/restore, editor/scope changes, requested-space
propagation, favorites, tag metadata/attachments and feedback counts.

## Mapping

| Fields | Mapping |
| --- | --- |
| `workspace_id`, `skill_id`, `status`, `availability` | `keyword` |
| `name` | compound-name `text`, `keyword`, `wildcard` |
| `description` | English `text`, `wildcard` |
| `requested_space_ids`, `editor_user_ids`, `tools` | `keyword` arrays |
| `editor_group_ids` (skills) | `keyword` array |
| `icon`, `edited_by`, `updated_at` | `keyword`, `long`, `date` |
| `active_users`, `favorite_count`, `is_default` | `integer`, `integer`, `boolean` |
| `resource_id` | alias to `skill_id` (or `agent_id` in the agent index) |
| `metadata` | source-only object, `enabled: false` |

Tools are MCP server view sIds; editor user/group IDs are internal IDs supplied from the
authenticator, not caller-provided model IDs. The builder's individual-editor list remains in
`editor_user_ids`. `editor_group_ids` includes every instance editor grant, including manual,
provisioned and global groups, without expanding their membership into user lists.
Instructions are never indexed.
All requested spaces, including projects/pods, are stored in a single field.
Missing, duplicate or foreign-workspace space references invalidate a projection.
Only active skills are indexed, using a repeatable-read snapshot of row and relations.
Source-only metadata carries the remaining stripped listing fields: creation time,
agent-facing description, source attribution, reinforcement settings and manually
requested spaces. The authorized document hydrates `SkillResource`; its canonical
serializer produces `SkillWithoutInstructionsAndToolsType`, never a parallel skill type.

`front.agents` (initially `front.agents_1`) uses the same shared fields with `agent_id`
instead of `skill_id`, plus `tags`, `skills` (keyword arrays) and `feedbacks` (integer).
It omits `is_default` and `editor_group_ids`. A source-only stable `agent_model_id` and metadata object allow
reuse of `LightAgentConfigurationType` without reading or indexing prompts or tool
configuration. `resource_id` aliases `agent_id` for shared sorting. The projector
selects the latest version of each stable identity; inactive latest versions never
fall back to older active rows. Workspace/space/editor validity is checked in a
repeatable-read snapshot, with batched relation reads.

Visible agents map to `workspace_users`, hidden agents to `editors`. Agent editor IDs
include the existing author fallback. Unlike the skills-specific API-key exception,
agent search keeps the existing agent visibility rules. Admin redaction preserves
the light listing with `canRead: false` and no prompt, skills or tool configurations.
The stable `AgentResource` ACL and configuration visibility are distinct existing
contracts: administrative access to the stable resource does not make private
configuration details readable. Search follows the configuration author/editor and
requested-space checks, matching the existing details reader.

## Permissions and queries

`auth.getResourceIdsWithVerb("space", "read")` supplies readable space IDs with no
fetch. Open spaces and pods are included through global-group reader grants. A
type-wide grant means all spaces; an admin role alone does not confer read access.

Every resource search query filters `workspace_id` and active status. Strict search also requires:

- Every requested space is readable: no requirements matches directly; otherwise
  `terms_set` on `requested_space_ids` requires `doc['requested_space_ids'].size()`
  matches. The invariant is `skill spaces ⊆ caller readable spaces`, not the reverse.
- Published availability or a matching editor user/group for editors-only skills.
  Type-wide skill write grants use Authenticator's resolved permissions, without per-skill
  indexing fanout. Those skill-specific paths never grant access to hidden agents.
  API keys retain their existing skill editor-visibility exception.

Group matching reuses `auth.groupModelIds()`; it adds no membership read to search. This is
needed for parity with generic grants, which `canWrite` accepts even when the individual-editor
list is empty. `editedByMe` uses the same editor predicate. New workspace members immediately
match an indexed global-group grant, without reindexing skills. The additive group field must
be mapped before deploying its writer and backfilled for existing group-based grants. Old
documents without the field remain usable through the individual-editor path during backfill.

Candidate batches undergo committed-state validation of row-read permissions,
spaces, availability, editor user/group grants and lifecycle. Stale permission fields fail closed.
There is no per-skill SQL query or separate candidate-pod fetch. Selection filters
never replace ACL predicates; a PIT freezes index state, not authorization.

Admins can opt into `permissionFiltering=redact_unreadable`. ES still filters
workspace, status and selections but omits visibility gates. Canonical resource
redaction retains unreadable listing metadata with `canRead: false`; readable
entries retain `canRead: true`. Editor and administration flags also keep their
canonical meaning: a workspace-wide skill reader grant can permit reading an
editors-only skill even when strict search hides it from a non-editor. Instructions,
tools and files never appear in search responses. Non-admin redaction requests receive 403.

For an admin management listing, pass `permissionFiltering=redact_unreadable` to
either search endpoint (or the skill search hook). Omit it for slash commands and
other selection flows: strict filtering remains the default. Redaction changes
listing visibility only; it grants no read, edit or execution permission. A cursor
cannot be reused between strict and redacted searches.

## Ranking and filters

`GET /api/w/:wId/search/resources` exposes the shared search. Optional
`resourceTypes=skill,agent` chooses either type or both (default). Results contain
`type`, `resource` (the existing stripped skill or light agent shape), and `score`,
plus one response-level `nextCursor`. The existing `/skills/search` endpoint delegates
to the same engine and preserves its slash-menu summary response.

Both accept `query`, optional `limit` (1–150), `cursor`, `permissionFiltering`, and `mode`:

- `autocomplete` (default): name/alias only; exact (100), prefix (80), substring
  (60), subsequence (40). Usage does not affect slash ordering.
- `management`: text recall includes descriptions; sort by active users, then name.
- `discovery`: text relevance plus `log1p(active_users)` and, for agents,
  `log1p(feedbacks)`. Description substring and
  subsequence scores are 20 and 10. This initial formula is an experiment, not a
  claim of measured discovery quality.

Empty text matches all eligible resources. ES and TypeScript share scoring rules,
float32 comparisons and name/ID keyword-byte tie-breakers. Wildcards fold ASCII only.

Comma-separated `spaceIds`, `toolIds`, `availability` match any value within each
dimension, ANDed across dimensions. `isDefault` and `editedByMe` accept true/false.
Globals obey these filters too: no editors or explicit space requirements; tools
come from their definitions. The existing summary response adds score and `nextCursor`.
The shared endpoint also accepts `tagIds` and `skillIds`, which select agents.
`isDefault` selects skills. The indexed agent stream contains workspace-owned agents only;
active global agents join the same synthetic stream as code-defined skills. Their canonical
catalog applies current workspace settings, provider allowlists, feature flags, retirement
and audience rules before search. Redaction does not bypass those global-agent gates.

Ordinary global-agent search uses the existing light catalog reader. Tool/skill selection
uses the full canonical capability reader because some attachments depend on live company
knowledge; it is read-only and never creates automatic tool views. This path currently loads
the catalog's company data-source views and is more expensive than ordinary name/usage search.
Its production latency still needs measurement. Responses always use the light schema with
instructions, tool configurations and skill attachments stripped. Discovery adds one batched,
workspace-scoped feedback-count query for the eligible global agents.

Global-agent availability settings are read and written through
`GlobalAgentSettingsResource`, including workspace scrub. Updates are admin-only and use
one workspace/agent upsert. Search reads current settings, so changes invalidate the catalog
fingerprint without indexing global documents. The existing Deep Dive restriction cache
retains its three-second TTL.

The implementation lives in `lib/search/{resource_query,resource_candidates,ranking,cursor}.ts`
and `lib/api/resource_search.ts`. Skill-only helpers are compatibility forwarders, not a
second query or pagination implementation. Each candidate batch uses one ES request over
the selected aliases and batched current-state reads for each returned resource type.

## Pagination

One PIT spans the selected indexes, sorted by score, name and the shared `resource_id`
alias (with PIT's shard-document tiebreaker). The backend merges indexed and code-defined
streams. The ES cursor advances only
past returned or denied hits, never authorized hits displaced by globals.
Unconsumed hits are refetched; globals have an independent offset.

Immutable Redis cursors expire after five minutes and bind workspace, caller,
resource types, permission mode, ranking mode, query and global catalog. Changed readable spaces
(including pods), filters or global ranking require restarting after a 400.
Redaction still rechecks `canRead` when its broad query remains unchanged.

Each request processes at most five batches of 50–200 candidates. Short/empty pages
can have a continuation: use `nextCursor`, not result count, for exhaustion.
Single-page searches close their PIT; other PITs expire naturally for retryability.

## Freshness and operations

Temporal indexes the latest committed projection or deletes an inactive/invalid
document. `SkillResource` owns indexation for creation, updates, archive/restore,
deletion, availability, editors, favorites and self-improvement metadata. Routes,
imports and skill-authoring tools no longer launch a second indexing workflow.
Explicit outer transactions defer enqueueing until commit; rollback suppresses it.
Skill row, attachment, knowledge, tool and editor writes share the update transaction.
Space cleanup includes skill updates in its transaction, so a later cleanup failure
does not leave committed skill changes behind. Favorites update their list/count
atomically. `GroupResource` owns editor-membership fanout for additions, removals,
suspension, restoration, identity merges and group deletion. It resolves affected
skills and logical agents in batches; deletion captures targets before cascading
their grants and invalidates cached grants after commit. WorkOS retries retain a
historical-membership repair path. Workspace membership changes alone do not change
the indexed editor grant holders; request authentication checks membership live.
Workspace scrub, backfill and relocation also enqueue current projections.

Tag changes refresh all affected logical agents, deduplicating configuration versions;
deletion captures those targets before removing links. Feedback creation/deletion and
batched message cleanup refresh the total feedback count. Editing feedback text,
direction or dismissal does not change that total. These writers share the dependency-light
`AgentSearchIndexationResource` entrypoint with `AgentResource` and group/space propagation.

Direct editor-grant writes refresh their exact resource targets. Standalone tool/skill
attachments and skill deletion refresh affected agents; parent-reference rewrites refresh
changed parents' indexed timestamps. Agent favorite writes and identity merges belong to
their resources. The favorite backfill uses bounded inserts, preserves existing opt-outs,
and supports a no-write dry run; workspace scrub deletes relations in one scoped operation.

Tool-view hard deletion and promotion from regular spaces to the global space remove stored
agent/skill attachments and enqueue their projections after commit. Promotion does not
automatically reattach the new global view. Soft deletion retains stored attachment rows, so
the indexed `tools` IDs remain unchanged: this filter describes stored attachments, not a
tool's current executability.

Agent version deletion, author cleanup and workspace scrub go through `AgentResource`.
Tool dependencies (including pod attachments) are deleted in the same transaction.
Deleting an old version preserves the stable identity, grants, favorites and memory while
another version remains; legacy editor groups are removed only when no version references them.
The author-deletion script supports a read-only dry run. Workspace scrub also clears global
agent preferences and retries the workspace-wide index deletion even when DB rows are already gone.
The draft-cleanup script uses the same deletion path, excludes mentioned drafts with a
batched lookup, and never writes during a dry run.
Orphaned-space repair is also resource-owned: it removes missing or foreign-workspace
requirements from active versions, preserves other fields and refreshes affected agents.
It supports dry runs and an optional single-workspace scope.

`update_agent_requested_group_and_space_ids.ts` delegates to
`AgentResource.rebuildSpaceRequirements`. It batches tool and attached-skill reads, includes
unreadable skills' required spaces and pods, preserves non-permission fields, and indexes only
after commit. Workspace/agent selection, active-only filtering and dry runs remain supported.
Unlike orphan repair, this operator command replaces requirements with those derived from
capabilities: manually supplied additional agent restrictions are not retained. Use orphan repair
when the goal is only to remove missing space IDs.

MCP view/server deletion and skills-only restriction updates also refresh affected tools.
Their dependency cleanup includes agent pod attachments and runs in the enclosing transaction;
skill/agent indexing and sandbox output-file removal wait for the outer commit. A rolled-back
view deletion restores both the links and the files it references.

Nested mutation savepoints use `withTransaction(..., { useSavepoint: true })`. It keeps
database savepoint names unique on the root connection and tracks logical parents for
after-commit effects, avoiding Sequelize v6's native nested-savepoint naming bugs.
Do not introduce native nested `sequelize.transaction`/`findOrCreate` savepoints inside
these aggregate writes; they bypass this helper.
For callbacks returning `Result`, use `withTransactionResult`: `Err` rolls back rather
than committing a successful prefix. Agent editor updates use this for both legacy
memberships and stable grants; indexation and success audit follow only a successful commit.

Daily usage snapshots cover the previous 30 complete UTC days, matching the existing
agent ranking window. Consumption aggregations count distinct users, not steps/tool
documents, and follow every composite `after_key`. Skill attribution uses
`tool.attributed_skill_ids`, agent attribution `agent.attributed_id`, restricted to
existing human usage origins with a user ID.

Ordinary upserts preserve `active_users`. Daily updates reset absent counts to zero
and never recreate deleted documents. Code-defined skill and agent counts live in separate
workspace Redis snapshots with 48-hour TTL: ranking data only, never ACL decisions. Autocomplete
does not read it. The existing ES worker runs the daily workflow and refreshes both
skill and agent documents, using the same evaluation timestamp and 30-day window.

Install the schedule in each region after deployment:

```sh
tsx front/scripts/refresh_search_usage.ts --execute
# Refresh one workspace immediately:
tsx front/scripts/refresh_search_usage.ts --wId WORKSPACE_ID --execute
```

Create the registered `skills` index and run `backfill_skill_search.ts` before reader
cutover. Completion means workflows finished and ES refreshed, not merely enqueued.
Validate canonical counts/ACL parity before alias cutover; retain the old physical
index. Local POC data was migrated from `front.skill_search` to `front.skills` this way.
An existing local `front.skills_1` also needs the additive `resource_id` alias and
`metadata` mapping before the shared reader/indexer runs; reindex its canonical documents
to populate metadata. The reader can hydrate missing legacy metadata from its existing
validation projection during that backfill, without adding a second DB fetch.

The existing backfill command now also accepts `--resourceType agent`; its default
and `--fromSkillModelId` resume option remain compatible. Agent pagination uses the
stable identity key, with `--fromAgentModelId` for resuming. For example:

```sh
tsx front/scripts/create_elasticsearch_index.ts --indexName agents --execute
tsx front/scripts/backfill_skill_search.ts --resourceType agent --wId WORKSPACE_ID --execute
```

Workspace hard deletion/scrub removes agent documents too. Relocation clears and
rebuilds the agent index in the destination region, protected by a workflow patch
marker for existing executions. Agent backfill includes inactive identities so the
same projector workflow can delete stale documents. Orphaned identities still need
workspace reconciliation.

There is no transactional outbox. A lost launch can leave hidden/stale data until
another mutation or repair. Eventual visibility, a few hundred readable pods, and
acceptable wildcard cost remain hypotheses to validate against production SLOs,
not authorization exceptions.
