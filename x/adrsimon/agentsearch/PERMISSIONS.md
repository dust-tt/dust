# Permissions

What agent discovery shows a given user, and how the harness reproduces it in Elasticsearch.

`README.md` covers running the harness and `NOTES.md` records what has been measured. This file is only about access.

## Part 1: how front decides

Every agent list in the app comes out of `getAgentConfigurationsForView` (`front/lib/api/assistant/configuration/views.ts`). The caller picks a view (`list`, `manage`, `all`, `favorites`, `analytics`, and a few more) and gets back the agents that view exposes to that `Authenticator`. The harness models `list`, the view used for agent discovery and the `@` mention picker. `manage` shares the two permission gates but handles inactive global agents differently.

It fetches candidate rows from Postgres with a scope predicate in the `WHERE` clause, then drops the ones whose spaces the caller cannot read. Global agents come from a separate code path and rejoin the list at the end.

### Gate 1: scope

Scope lives on the agent row and says who the agent was published to.

| scope | who sees it in `list` / `manage` |
|---|---|
| `visible` (formerly `workspace` / `published`) | everyone in the workspace |
| `hidden` | the agent's editors |
| `global` | everyone, and the row is synthetic |

The SQL for `list` and `manage` is an `OR` over those cases (`views.ts:261`): scope in the visible family, or the caller authored it and it is `private` (a legacy scope), or its id appears in `agentIdsForUserAsEditor` and the scope is `hidden`.

That editor list is resolved before the query by `GroupResource.findAgentIdsForGroups(auth, auth.groupModelIds())`. Each agent owns an editor group; being in the group makes you an editor. Editorship is therefore group membership, not a column on the agent.

Global agents skip all of this. `getGlobalAgents` builds them in code rather than reading them from a table. `list` keeps only the active global agents (`views.ts:130`), while `manage` returns inactive ones too (`views.ts:117`).

`status: "active"` and the workspace id are in the base `WHERE` for stored agents, so archived and cross-workspace rows never enter the candidate set. The separate global-agent path applies the view-specific status rule above.

### Gate 2: requested spaces

An agent's tools point at data. The spaces holding that data are denormalized onto the row as `requestedSpaceIds`, and the rule is unanimity (`agent.ts:1801`, `permission_utils.ts:14`):

```ts
return requestedSpaceIds.every(
  (spaceId) => spaceById.get(spaceId)?.canRead(auth) ?? false
);
```

Read one of an agent's spaces but not all of them and the agent disappears. A space that no longer resolves scores `false` through that `?? false`, so an agent pointing at a deleted space drops out with the same verdict as one pointing at a space you were never granted.

`canRead` is `auth.hasPermission("read", space)` against the ACLs the space serves from `group_permissions`. A space is readable when some group you belong to holds a read grant on it. Open spaces attach the workspace global group as a viewer, which is what `isOpen()` tests, so every member reads them; restricted spaces have no such grant and only their members get in.

Pods are project spaces. They carry no carve-out anywhere in this path: `filterAgentsByRequestedSpaces` treats a project space exactly like a regular one, and `canRead` resolves both through the same grant lookup. The only thing that distinguishes pods here is how many of them a workspace can have, which is the subject of part 2.

Some views deliberately skip gate 2. `manage_unrestricted` lists everything for admins, `analytics` does the same for managers because credits are reported for agents built on spaces they cannot read, and `archived` is unrestricted for admins. Callers gate those on role.

### Where the work happens

Gate 1 is SQL. Gate 2 is a filter in application code over rows Postgres already returned, after one `SpaceResource.fetchByModelIds` for the spaces those rows mention. Nothing in the request path enumerates the caller's spaces, and nothing sends a space list to the database.

That last point matters for part 2, because the obvious Elasticsearch translation does both.

## Part 2: how the harness replicates it

The index holds one document per agent with the fields the two gates need:

```
status, scope, editors[]
non_pod_space_ids[],   non_pod_space_count
pod_space_ids[],       pod_space_count
```

`editors` holds emails, resolved at export time by `getAgentsEditors`, which reads the agent's editor group. It is a denormalization of front's `agentIdsForUserAsEditor`, computed per agent instead of per caller.

The caller is a profile: the output of `scripts/export_user_profile.ts`, holding `auth.groupIds()` and the spaces where `space.canRead(auth)` holds, split into pods and non-pods. It is a snapshot of an `Authenticator`, so it answers as the user was at `generatedAt`.

`scripts/query.ts` turns the two into one `bool` query. Access clauses go in `filter`, so they are unscored and cacheable. Ranking goes in `must` and `should`.

### Scope, in one clause

```json
{ "bool": { "should": [
    { "terms": { "scope": ["visible", "global"] } },
    { "bool": { "filter": [ { "term": { "scope": "hidden" } },
                            { "term": { "editors": "adrien@dust.tt" } } ] } }
  ], "minimum_should_match": 1 } }
```

Plus `{ "term": { "status": "active" } }`, which the export already guarantees but the filter states anyway.

This is the whole of gate 1, and it is where the corpus concentrates: of 2,566 agents, 2,141 are `hidden`, 377 `visible`, 48 `global`. The `hidden` branch does most of the work, and 1,854 of those hidden agents carry a non-empty editor list.

`--exclude-global` drops `global` from the terms, which is what the *All custom* tab shows.

### Spaces

Gate 2 says every requested space is readable. Written literally for one space class, that is a `terms_set` carrying the caller's readable spaces, with the required count stored on the document:

```json
{ "terms_set": { "non_pod_space_ids": {
    "terms": ["<every space the caller can read>"],
    "minimum_should_match_field": "non_pod_space_count" } } }
```

The same clause would be required for pods. It works, and it stops working as soon as pods scale. `terms_set` expands to one Lucene clause per term, so its ceiling is `maxClauseCount`: 1,024 at the floor, derived per node from heap and CPU above that. This laptop reports 2,978, verified by bisection, and 2,979 terms throws `query_shard_exception`. A caller who can read 3,000 spaces gets an error instead of an agent list, and the threshold moves between nodes.

Two changes fix it, and the first is to send whichever side is shorter. The contrapositive of "every requested space is readable" is "no requested space is unreadable", which is a `must_not` over a `terms` clause. That clause stays a single `TermInSetQuery` however long its list, capped by `index.max_terms_count` at 65,536 rather than by the clause budget. Neither side is bounded on its own, since a workspace can reference thousands of spaces and a caller can read thousands, so `buildSpaceClassFilter` measures both and picks the smaller, taking the positive form only while it stays under the budget.

The second is to filter pods apart from everything else. Non-pod spaces are bounded by the workspace, pod access by the caller's memberships, and pooling them lets whichever is larger size the whole list. Each class gets its own clause and the two are ANDed, which is what unanimity means anyway.

Each class then takes whichever of four shapes is cheapest:

| the caller reads | clause | terms sent |
|---|---|---|
| nothing in the class | `term` on the count field, zero | 0 |
| few of the referenced spaces | `terms_set` over those | what they read |
| most of them | `must_not` a `terms` list | what they cannot read |
| all of them | no clause | 0 |

Measured on a synthetic corpus of 2,566 agents over 5,252 referenced pods, growing only the caller's pod count:

| caller's readable pods | `terms_set` over all readable | this filter |
|---|---|---|
| 20 | 1.1 KB | 1.2 KB, `terms_set`, 20 terms |
| 1,000 | 15.9 KB | 16.0 KB, `terms_set`, 1,000 terms |
| 3,000 | fails, `maxClauseCount` | 33.7 KB, `must_not`, 2,252 terms |
| 5,000 | fails | 4.3 KB, `must_not`, 252 terms |
| 5,252 | fails | 0.8 KB, no clause |

Request size peaks near the halfway mark and shrinks as access grows past it.

### What keeps the lists short

Only a space some agent actually points at can change the answer, so both branches range over the referenced set rather than the space table. Across the real corpus that is 88 distinct spaces, 35 of them pods, and no agent requests more than five.

`fetchReferencedSpaces` reads them from a `terms` aggregation over active agents. In front the same set is a `SELECT DISTINCT unnest("requestedSpaceIds")` over the workspace's active agents, cacheable per workspace and invalidated when an agent's spaces change. Readability then resolves through `SpaceResource.fetchByIds` over that bounded set, which preserves front's property that no request path enumerates the caller's spaces.

The set is safe to over-list and unsafe to under-list. Naming a space no agent requests costs nothing, because the extra id is genuinely unreadable and excludes only agents that should already be excluded. Missing a space that some agent requests leaks that agent. A cache lagging on space deletions is therefore harmless, and one lagging on additions is not.

A deleted space is absent from the readable set, lands on the denied side, and takes its agents with it, matching front's `?? false`. That only holds while every requested id survives into one class or the other, so `toAgentSearchDocument` refuses to build a document whose two class arrays do not add up to `requestedSpaceIds`. An id dropped from both is deniable by no clause, and the agent it belongs to outlives the filter.

### Keeping ranking out of the filter

Group adjacency (`usage.by_group`) scores agents used by the caller's groups. It sits in `should` alongside a `must` holding the text clauses, so it only contributes score. Collapsing the two into one `should` under `minimum_should_match: 1` makes any agent with group usage match every query, which is a permission-shaped bug even though the clause is about ranking. `README.md` covers the ranking side.

## Verification dataset

The committed fixtures under `assets/permissions/` exercise the permission model without production data. `agents_mocked.json` contains 21 agents over three non-pod spaces and two pods. It covers:

- `visible`, `hidden`, and `global` scopes, plus inactive visible and global agents;
- hidden agents with a matching editor and with another editor;
- agents that request no spaces, one space, multiple spaces of one class, spaces from both classes, or all five spaces;
- hidden agents whose editor can read all, some, or none of their requested spaces.

Each `user_mocked_*.json` file describes one readable-space and identity scenario and carries the exact `expectedAgentIds` for that scenario. The named cases cover no spaces, company only, one or all restricted spaces with no pods, one or all pods, mixed pod and non-pod access, all spaces, three editor access levels, global exclusion, an extra readable space that no agent references, and a deleted requested space.

### Test harness

`npm run test:permissions` creates a temporary Elasticsearch index with the production mapping and indexes `agents_mocked.json` through the same document conversion as normal ingestion. It sends each permission check through `buildAgentSearchQuery`, the entry point used by search and eval, with an empty search term. For each named user it performs two comparisons:

1. The fixture's `expectedAgentIds` must equal the direct permission predicate.
2. The Elasticsearch result must equal that same predicate.

The direct predicate keeps the expected side independent of the Elasticsearch query shape:

```ts
agent.status === "active" &&
scopeAllows(agent, user) &&
agent.requestedSpaceIds.every((id) => readableSpaceIds.has(id))
```

After the named cases, the harness generates all 32 subsets of the five mocked spaces and runs each one as an editor and a non-editor. These 64 combinations check every readable-space combination against the indexed filter. The named `exclude-global` case checks the optional global-agent branch separately.

Five structural assertions pin the clause selection: no access, full access, `terms_set`, `must_not` because the denied side is shorter, and `must_not` because the readable side exceeds the 1,024-term budget. A final Elasticsearch query uses 5,000 readable and 5,001 denied spaces. The bounded query must return without a `query_shard_exception`; forcing the positive `terms_set` form crosses this node's clause limit.

Run it against the local Elasticsearch container:

```bash
npm run es:up
npm run test:permissions
```

A successful run currently reports:

```text
permissions: 14 named scenarios, 64 exhaustive combinations, 5 shape assertions, 1 clause-budget query, and 1 over-listing check passed
```

This proves equivalence between the direct predicate and the production query builder for the modeled scopes, identities, and space combinations. It also exercises the clause-budget branch against Elasticsearch. It does not test how `front` computes live ACLs or editor groups.

### Additional checks

The filter is also verified equal to the `terms_set` translation on full id sets, not just counts: at 0, 20, 1,000, 2,000 and 2,900 readable pods on the synthetic corpus, and on the real corpus for a caller reading none of the 35 pods (389 agents) and all of them (416). Past 2,978 the old form cannot run to be compared. The eval is unchanged to three decimals across 2,184 queries.

### Known gaps

- The profile is a snapshot. Memberships change, and a stale profile answers as the user was when it was taken.
- Legacy scopes (`workspace`, `published`, `private`) do not appear in the export, so the author branch of front's `list` predicate has nothing to match and is not implemented.
- `manage` includes inactive global agents. The harness models `list` and excludes them.
- Views that skip gate 2 on purpose (`manage_unrestricted`, `analytics` for managers, `archived` for admins) are not modelled. The harness always applies the space filter.
- `editors` is denormalized to emails at export time. Front resolves editorship live from group membership, so a membership change between export and query shows up here and not there.
