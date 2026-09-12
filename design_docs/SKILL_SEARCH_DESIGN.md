# Elasticsearch-backed skill search

**Status:** PoC findings and recommended production direction. This note separates the invariants
production must preserve from the hypotheses that still need validation.

## Problem

The slash menu currently loads every active custom skill before searching. The PoC tests whether
Elasticsearch can recall a small, permission-aware candidate set without making search depend on a
caller's complete pod membership set.

PostgreSQL remains the source of truth. Elasticsearch stores a derived projection of committed
skills, and every result is checked against current PostgreSQL state before it is returned.

## Production invariants

| Invariant                                                   | Enforcement                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant isolation                                            | Every ES read and workspace-wide delete filters `workspace_id`. Document IDs and bodies include the workspace. Canonical reads, rebuilds, and relocation are workspace-scoped.                                                     |
| PostgreSQL and current authorization remain authoritative   | ES applies permission-aware candidate filters. Candidate pods and editors-only hits are checked with the current authenticator, then every permission-bearing indexed field is compared with a fresh DB projection.                |
| Stale ES state never expands access                         | A missing, inactive, malformed, or permission-mismatched projection drops the hit. Stale restrictive state may temporarily hide a valid skill.                                                                                     |
| Every requested space is readable                           | `terms_set` and `non_pod_space_count` enforce all non-pods. The one optional pod must exist, still be a project, and pass the current space ACL. Documents with more than one pod are rejected.                                    |
| Editors-only visibility matches the skill ACL               | For user requests, ES requires either a published availability or `editor_user_ids` to contain `auth.user().id`. A zero-query application check confirms the current `write` grant. API keys keep their existing bypass.           |
| Authorization precedes the result limit                     | One bounded ES request is followed by current authorization and canonical validation. Slicing happens last.                                                                                                                        |
| Search never enumerates caller-wide pods                    | Only distinct pod IDs present in the bounded candidate window are fetched. This also preserves access through open pods.                                                                                                           |
| Index state must converge to the latest valid DB projection | Idempotent workflows rehydrate current state. Backfill repairs active documents, and relocation rebuilds moved workspaces. Not fully enforced: without a transactional outbox or orphan reconciliation, a lost launch can persist. |
| Command-menu composition remains client-owned               | Code-defined skills and tools stay outside ES. The client keeps the final cross-kind ranking. Favorites are intentionally out of scope.                                                                                            |

Normal request-snapshot and authenticator freshness limits still apply. Elasticsearch must not
become a second source of permission truth.

## Hypotheses to validate

| Hypothesis                                                                            | Why it matters                                                                                                                                           | Validation                                                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Readable non-pod sets and per-skill non-pod requirements remain reasonably small.     | Readable non-pod IDs are sent to `terms_set`; canonical validation loads the candidates' requested spaces.                                               | Measure p50, p95, and max counts, payload size, rows, and latency by workspace size.          |
| A 200-hit candidate window provides acceptable authorized top-K recall.               | Pod-inaccessible and stale candidates can crowd out later valid hits. Editors-only skills are filtered in ES and should not normally consume the window. | Shadow the previous full-list result and track rejection, underfill, and no-result rates.     |
| Subsequence wildcard recall is relevant and affordable at production scale.           | `size: 200` limits returned hits, not ES query evaluation work.                                                                                          | Run relevance fixtures and load tests across index size, concurrency, and query length.       |
| One ES request plus bounded, batched DB validation meets interactive latency targets. | The path still reads current spaces, candidate pods, skills, requested spaces, and editor grants.                                                        | Trace p50, p95, and p99 latency, query count, and rows read.                                  |
| Eventual visibility and temporary false negatives fit an explicit UX SLO.             | Temporal scheduling and ES refresh delay newly changed skills.                                                                                           | Measure mutation-to-visible lag, stale age, and user-visible misses.                          |
| Caller-owned indexation plus repair keeps drift within an explicit repair SLO.        | There is no outbox or DB fallback; a lost or omitted workflow launch can persist.                                                                        | Compare mutations with accepted workflows and measure missing, stale, and orphan repair time. |
| Editor lists remain bounded enough to store on one skill document.                    | Editor IDs are intentionally denormalized to make editors-only filtering part of the ES query.                                                           | Measure editor counts and document size, and define a supported upper bound.                  |

If a hypothesis fails, we should change the mechanism or add durability rather than weaken these
invariants.

## Index document

The stable alias is `front.skill_search`; the first physical index is `front.skill_search_1`. The
mapping is strict, and the deterministic document ID is `<workspaceId>_<skillId>`.

| Field                      | Mapping                         | Purpose                                                  |
| -------------------------- | ------------------------------- | -------------------------------------------------------- |
| `workspace_id`, `skill_id` | `keyword`                       | Tenant scope, identity, and stable sorting.              |
| `status`, `availability`   | `keyword`                       | Active-state and publication filters.                    |
| `name`                     | `text` + `keyword` + `wildcard` | Relevance, alphabetical sort, and subsequence matching.  |
| `user_facing_description`  | `text` + `wildcard`             | Relevance, subsequence matching, and display.            |
| `non_pod_space_ids`        | `keyword[]`                     | Required non-pod spaces used by the ES all-of filter.    |
| `non_pod_space_count`      | `integer`                       | Minimum number of required non-pod matches.              |
| `editor_user_ids`          | `long[]`                        | Internal user model IDs used by the editors-only filter. |
| `pod_space_id`             | source-only nullable `keyword`  | The optional pod, authorized after ES.                   |
| `requested_space_ids`      | source-only `keyword[]`         | Canonical space projection and API response.             |
| `icon`, `edited_by`        | source-only `keyword` / `long`  | Display fields.                                          |
| `updated_at`               | source-only `date`              | Diagnostic and migration metadata.                       |

Source-only means `index: false, doc_values: false`.

`name` uses a `word_delimiter_graph` analyzer with the `keyword` tokenizer, original-token
preservation, concatenation, and lowercasing. A name such as `WeeklyReportBot` is searchable by the
whole name and its component words.

The DB projector derives two permission projections: it splits requested spaces into non-pods and
one optional pod, and it resolves the active memberships of the skill's canonical editor-grant
group into sorted, deduplicated internal user IDs. It rejects duplicate, missing, or
cross-workspace requested spaces and more than one pod.

Editor IDs deliberately do not depend on current workspace membership. A workspace-membership-only
revoke or rejoin therefore does not fan out into skill reindexing; an inactive caller cannot
authenticate into the workspace, and the existing editor grant becomes effective again after a
rejoin. Flows that physically end or restore editor-group memberships, such as WorkOS
deprovisioning, do reindex affected skills.

## Query and permission enforcement

Each request follows one bounded path:

1. Derive the caller's readable non-pod space IDs; projects are excluded.
2. Run one ES query filtered by `workspace_id`, `status: active`, the non-pod all-of predicate, and
   availability. User requests admit published skills or editors-only skills whose
   `editor_user_ids` contain the current user's model ID. API keys omit the availability filter to
   preserve existing behavior.
3. Fetch only pod IDs appearing in the ES candidates and apply the current space ACL. The pod must
   still exist and still be a project.
4. Recheck editors-only candidates with the current authenticator. This uses already-hydrated
   grants and adds no query.
5. Rebuild survivors from PostgreSQL and compare all permission-bearing fields before applying the
   final result limit.

The non-pod predicate is an all-of check. Skills with no non-pod requirement match directly;
otherwise `terms_set` uses `non_pod_space_count` as `minimum_should_match_field`, proving:

```text
skill required non-pod spaces ⊆ caller readable non-pod spaces
```

Text recall combines boosted `bool_prefix` matching with case-insensitive subsequence wildcards on
name and user-facing description, preserving matches such as `sand` →
`Search And Navigate Data`. The PoC uses a 50–200 candidate window.

All database work is batched; there is no result-level N+1. The search-specific ES payload and pod
fetch never enumerate the caller's complete pod set.

## Invalidation and lifecycle

Skill create, update, import, archive, restore, availability, requested-space, and editor mutations
enqueue per-skill Temporal indexation after the database mutation. Editor membership changes made
through file import, Poke, user merge, or WorkOS deprovision/rejoin must enqueue every affected
skill. The activity rehydrates the latest DB projection and indexes it, or deletes the document
when no active valid projection remains.

Changing an existing space's membership, groups, ACL, or open/restricted state does not reindex
skills. Non-pod access comes from the caller's current readable-space set, and pod access is checked
live. Changing which spaces a skill requests does reindex that skill.

Workspace scrub asynchronously enqueues workspace-wide deletion. Backfill pages active skills and
enqueues the same workflows. Completion requires waiting for the queue and ES refresh, and orphaned
documents need separate reconciliation. Relocation clears and rebuilds a workspace in its
destination region, restarting from the beginning on activity retry.

There is no transactional outbox between the DB commit and Temporal acceptance. A lost or omitted
launch can leave a skill hidden or stale until another mutation or repair. New mutation paths must
schedule indexation explicitly.

## Alternatives rejected

- Sending every user pod ID to ES: the list is unbounded and omits readable open pods.
- Denormalizing space viewers or caller ACL documents: membership and ACL churn would create a
  security-critical fan-out and synchronization problem.
- Filtering every requested space only after ES: inaccessible non-pod skills would consume the
  bounded candidate window.
- A second ES query: it adds a round trip and ordering reconciliation without fixing bounded
  recall.

The narrow denormalization of per-skill editor IDs is accepted because the list belongs to one
skill, has explicit mutation paths, and moves editors-only filtering into the first ES request.

## Rollout

Create the final index and alias in every region, deploy writers, backfill every active skill
including `editor_user_ids`, and wait for workflow completion and ES refresh. Before enabling the
reader, verify DB-to-ES parity for valid active projections and check for orphaned documents.
Missing editor IDs fail closed for editors-only skills. The reader has no database fallback.

## Code map

- Canonical projection: `front/lib/resources/skill/skill_search_document_resource.ts`
- ES mapping, reads, and writes: `front/lib/skill_search/`
- Lifecycle and repair: `front/temporal/es_indexation/`, `front/scripts/backfill_skill_search.ts`,
  and `front/temporal/relocation/`
