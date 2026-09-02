# agentsearch

A local Elasticsearch harness for **agent discovery**: given a user, which agents in their workspace are worth suggesting to them?

The idea is to combine two signals that neither the current agent search nor the analytics pages combine today:

- **BM25** over an agent's name, description and instructions — what the agent is *about*.
- **Usage in the groups the user belongs to** — what people *like them* actually use.

Everything here is a scratch harness for trying that out against a real workspace. It is not wired into `front` and does not serve traffic.

## Layout

```
agentsearch/
├── assets/
│   ├── agents_skeleton.json          shape of an agent export   (committed, no real data)
│   ├── profile_skeleton.json         shape of a user profile    (committed, no real data)
│   ├── permissions/                  mocked permission corpus and user scenarios
│   ├── agents_<wId>.json             a real export   (gitignored, you produce it)
│   ├── profile_<userSId>.json        a real profile  (gitignored, you produce it)
│   ├── eval_queries_<name>.json      a generated eval set (gitignored)
│   └── eval_baseline.json            metrics only, safe to commit
├── index/
│   └── agent_search.mappings.json    ES mapping for the discovery index
├── scripts/
│   ├── export_workspace_agents.ts    dumps a workspace's agents  — RUNS IN front/, not here
│   ├── export_user_profile.ts        dumps a user's Authenticator — RUNS IN front/, not here
│   ├── ingest.ts                     export JSON -> local ES
│   ├── test_permissions.ts           exhaustive permission-model integration test
│   ├── query.ts                      the query builder, shared by search and eval
│   ├── search.ts                     query CLI
│   ├── generate_queries.ts           builds a known-item eval set from the corpus
│   ├── eval.ts                       scores the ranker against an eval set
│   ├── es.ts                         tiny fetch wrapper
│   └── types.ts                      export + document types
└── docker-compose.yml                ES 8.16.0 on 127.0.0.1:9250
```

Port 9250 stays clear of the dev container (9200) and of dust-hive, which allocates `1X2XX` per environment.

Both export scripts live here as the single source of truth, but neither can run from here: they import `@app/...`, which only resolves under `front/`. Copy them into `front/scripts/` to run or typecheck them. The flip side is that `front`'s CI never sees them, so re-check after touching anything they call into.

## Quickstart

```bash
npm run es:up
npm run ingest                                   # defaults to assets/agents_0ec9852c2f.json
npm run search -- --q sales --spaces vlt_ZqMdUAzI0OTf --groups grp_gXHmJEbOCeCy
```

`npm run es:reset` wipes the volume and starts clean. Nothing here needs credentials: security is off, the cluster is single-node, and it binds to localhost only.

## Producing an export

**Nothing real is committed.** An agent export carries every agent's full instructions and group-level usage; a profile names a real person and their memberships. Both are gitignored. The skeletons and mocked permission fixtures are safe to commit. Two scripts produce the real files.

Neither runs from this directory — they import `@app/...`. On prodbox:

```bash
kclpush prodbox scripts/export_workspace_agents.ts /dust/front/scripts/export_workspace_agents.ts
kclpush prodbox scripts/export_user_profile.ts     /dust/front/scripts/export_user_profile.ts
kclssh prodbox
  cd /dust/front
  npx tsx scripts/export_workspace_agents.ts --wId <wId> --days 30 --execute
  npx tsx scripts/export_user_profile.ts --wId <wId> --email <someone@dust.tt> --execute
kclpull prodbox /dust/front/agents_<wId>.json        ./assets/agents_<wId>.json
kclpull prodbox /dust/front/profile_<userSId>.json   ./assets/profile_<userSId>.json
```

Then `rm` both files on the pod, and point ingest at the export: `npm run ingest -- --file assets/agents_<wId>.json`.

### Searching as a user

A profile is the slice of an `Authenticator` a search needs: role, `auth.groupIds()`, and the workspace spaces where `space.canRead(auth)` holds, split into pods and non-pods. Pass it instead of spelling out ids:

```bash
npm run search -- --profile assets/profile_<userSId>.json --q "pull request"
```

`--profile` overrides `--spaces` and `--groups`. It does not make the search permission-correct — see below — it just stops you hand-assembling ids that drift.

Profiles exported before pods were added to `readablePodSpaces` list zero of them, which silently hides every agent that requests a pod. Re-export rather than patch: `readablePodSpaces: []` on a workspace that has projects is the tell.

The export enumerates every space the caller can read, pods included. That is fine for a snapshot of one user and is exactly what a request path must not do — see the space filter below.

### What the export contains

Agent configuration comes from `getAgentConfigurationsForView` with `dangerouslySkipPermissionFiltering`, so unpublished agents and spaces the caller cannot read are included — this is an admin-side corpus.

Usage comes from **Elasticsearch, not Postgres**: `fetchAgentExportRows` (`front/lib/api/analytics/agents_export.ts`) over `front.agent_message_consumption_analytics`, the same helper used by `GET /api/w/:wId/analytics/export?table=agents&startDate=...&endDate=...`. Messages are a cardinality aggregation on `agent_message_id`, because consumption documents are split per LLM step and per tool call. The per-group breakdown is a nested terms aggregation on `user.group_ids`, and feedbacks come from `front.agent_message_analytics`, where they live as a nested field.

See `assets/agents_skeleton.json` for the exact shape.

## The permission model

The harness reproduces the `list` view used by agent discovery and the `@` mention picker. It applies the same two gates as front: every requested space must be readable, and the agent must be visible, global, or hidden with the caller as an editor. The `manage` view differs only by retaining inactive global agents.

The Elasticsearch space filter handles pods and non-pods independently. For each class it chooses between a positive `terms_set` and a negative `terms` clause, keeping the query within Lucene's clause budget without weakening the access rule. [PERMISSIONS.md](PERMISSIONS.md) contains the derivation, scale measurements, fixture contract, and known view differences.

Profiles are snapshots. A stale profile answers with the memberships recorded at `generatedAt`, not the user's current access.

### Permission model tests

The committed dataset under `assets/permissions/` contains 21 mocked agents and 14 named user scenarios. The harness exercises the production query builder for every subset of the five mocked spaces, checks its clause shapes, runs a 10,001-space clause-budget query, and verifies that over-listing referenced spaces is safe. [PERMISSIONS.md](PERMISSIONS.md) documents the fixture contract, coverage, and limits.

```bash
npm run es:up
npm run test:permissions
```

## Ranking

Matching and ranking are structurally separate. Text clauses go in a `must`, so they decide *which* agents come back; group adjacency goes in a `should`, which — with a `must` present — defaults to `minimum_should_match: 0` and therefore only contributes score. Collapsing the two into one `should` list means any agent with group usage matches every query, text match or not.

Text matching runs two `multi_match` clauses over `name^4` and `description^2`: a `best_fields` clause carrying full BM25 term weighting, and a `bool_prefix` clause at boost 0.5 for as-you-type prefix tolerance (`--match-mode`, default `hybrid`). `instructions` is **off by default** and enabled with `--with-instructions`; see below. Typo tolerance on `name` comes from a `fuzziness: AUTO` match (`--name-fallback`, default `fuzzy`). The alternative, a wildcard subsequence clause, is available as `--name-fallback subsequence` but is strictly worse — see below. Neither is applied to `description`: a subsequence only requires the letters in order *anywhere*, so on a field of a few hundred characters almost any short query matches — `*i*n*v*o*i*c*e*` happily matches "**In**cident in**v**estigat**i**on assistant for Dust using Datad**o**g logs".

`description` and `instructions` use an English analyzer — possessive stripping, lowercase, stopwords, light stemming — so `reviews` matches `review` and `for`/`the` stop being full-weight terms that match nearly every document. `name` uses a `word_delimiter_graph` analyzer so compound names split into their parts: `TitleClassifierAI` indexes as `titleclassifierai`, `title`, `classifier`, `ai`, and `agenda_cleaner` as `agenda_cleaner`, `agendacleaner`, `agenda`, `cleaner`. Without it the standard analyzer emits one opaque token and "industry radar" cannot find `IndustryRadar`. The same filter runs at search time, minus `flatten_graph`.

Adjacency is a `nested` query over `usage.by_group` matching the caller's groups, scoring `log1p(messages)` per matching group with `score_mode: "sum"` — so an agent used across several of your groups outranks one concentrated in a single group.

One trap worth remembering: **`boost` on a `nested` query is silently discarded** when the inner `function_score` uses `boost_mode: "replace"`. Scores came back byte-identical at boost 1 and boost 15. The weight has to go inside `functions[].weight`.

### Why instructions are off by default

The eval says including them is a small *gain* (+0.006 MRR). Ignore that number: known-item retrieval only asks whether the true target ranks well, and an agent's own prompt usually restates its purpose, so the target gets reinforced. What the eval cannot see is precision — there are no relevance labels for non-targets, so nothing penalizes irrelevant agents crowding the list.

That cost is easy to see by hand. `--q datadog` returns 1 agent by default (`IncidentQ`, which is genuinely about Datadog) and 7 with instructions on, the extra six being agents whose prompts happen to mention Datadog in passing — a cold-email writer, two Slack digests. Matching on instructions surfaces agents whose *prompt* mentions your term rather than agents that *do* your task. The flag is there for when you want that reach.

### Why `bool_prefix` alone is the wrong matcher

`match_bool_prefix` turns the **last** query term into a prefix query, and Lucene prefix queries are constant-scored — so whichever word you type last silently loses its IDF weighting. `help hiring` and `hiring help` therefore returned different agents: the first ranked Helper agents, the second ranked Hiring agents, each driven by whichever term was *not* last.

That behaviour is correct for an as-you-type picker, where the last token really is incomplete, and wrong for a submitted query. `hybrid` keeps both: a `best_fields` clause so every term keeps its weighting, plus the prefix clause at boost 0.5 so partial typing still works. It beats either alone on the eval — 0.981 against 0.972 for `bool_prefix` and 0.968 for `best_fields` at `msm 2<70%` — and both orderings now rank `Hiring` first.

### Coordination: why one matched term can win

BM25 sums over the terms a document *matches* and never penalizes the ones it misses — Lucene dropped the old `coord` factor when it moved to BM25. So for `help for PR review`, `HelpDeskStatusDemo` matched `help` alone and ranked first over an actual PR agent. IDF was not the problem: `help` in a name has df 20 (IDF 4.83) against `review` at df 14 (IDF 5.18), and `pr` in a description is the rarest term of the three. What beat them was `name^4` plus short-field length normalization — one term in a three-word name scores ~19, two rarer terms in a twenty-word description ~12.

`--min-should-match "2<70%"` restores coordination and is worth +0.045 MRR on the eval (0.927 to 0.972). It is **not** on by default, because it makes vocabulary mismatch fatal rather than merely bad: `review pull requests` correctly returns `CodingRules` first, while `PR review` returns nothing at all, since `pr` and `pull request` are unrelated strings and both terms are now required. Before turning it on, pick one of:

- **Graceful degradation** — run strict, and re-run looser when the result set is too small.
- **Synonyms** — an analyzer synonym list for domain acronyms (`pr` ⇒ `pull request`). Effective and precise, but a hand-maintained list that rots.
- **A semantic layer** — the only one of the three that generalizes to paraphrase.

### Flags

| flag | meaning |
| --- | --- |
| `--q` | search term; omit for pure usage-based discovery |
| `--profile` | a profile snapshot; fills in spaces and groups |
| `--spaces` | comma-separated space sIds the caller can read |
| `--groups` | comma-separated group sIds the caller belongs to |
| `--group-boost` | weight on the adjacency signal (default 0.5) |
| `--with-instructions` | also match against agent instructions (default off) |
| `--min-should-match` | ES `minimum_should_match` on the text query, e.g. `2<70%` (default off) |
| `--match-mode` | `hybrid` (default), `best_fields`, or `bool_prefix` |
| `--name-fallback` | typo tolerance on `name`: `fuzzy` (default), `subsequence`, `both`, `off` |
| `--exclude-global` | drop global agents, matching the *All custom* tab |
| `--limit` | number of hits (default 10) |
| `--explain` | dump the ES explanation for the top hit |
| `--es`, `--index` | point elsewhere |

## Evaluation

Tuning without measurement is guessing, so every ranking change should be scored. The harness does **known-item retrieval**: for each agent, synthesize queries someone might plausibly type to find *that* agent, then measure where it actually lands.

```bash
npm run gen:queries -- --profile assets/profile_pQwo5uKyt6.json --exclude-global \
  --out assets/eval_queries_dust.json
npm run eval -- --queries assets/eval_queries_dust.json \
  --profile assets/profile_pQwo5uKyt6.json --exclude-global
```

Candidates come from ES through the same filters the search uses, so the eval targets are exactly the agents the ranker is allowed to return — recall is never capped by permissions. Five query kinds, reported separately because they fail for different reasons:

| kind | example, for `TitleClassifierAI` | probes |
| --- | --- | --- |
| `name_exact` | `titleclassifierai` | the analyzer; should be ~1.0 |
| `name_words` | `title classifier ai` | tokenization of compound names |
| `name_prefix` | `titleclassi` | prefix matching, the `@` picker case |
| `name_typo` | `titleclassfierai` | a deleted character |
| `name_transpose` | `titleclasisfierai` | two swapped characters |
| `desc_terms` | high-IDF terms from the description | the description field |
| `desc_phrase` | a window around the top-IDF term | phrase-ish natural queries |

Description terms are picked by IDF computed over the candidate set, so a query is made of what actually distinguishes that agent from its neighbours. Query strings that two agents both produce are dropped as ambiguous rather than scored against an arbitrary winner.

`eval.ts` batches through `_msearch`, so a full 1,546-query run is about a second. Useful flags: `--group-boost` to sweep, `--misses N` to print what fell out of the top 10, and `--save` / `--compare` to diff two configurations:

```bash
npm run eval -- --group-boost 2 --compare assets/eval_baseline.json
```

Metrics are MRR@10 and recall@1/5/10. Queries that error in ES are counted as misses and reported — an eval that dies on one bad query is useless.

### Precision

Known-item retrieval alone is blind to precision: with one labelled document per query, nothing scores the *other* results, so junk crowding the list is free. Every relevance bug found so far — the ranking clause that satisfied matching on its own, the `description.subsequence` wildcard — was invisible to MRR and caught by hand. Three label-free proxies close that gap, all computed over the **non-target** results in the top 10:

| metric | meaning |
| --- | --- |
| `hits` | mean result-set size; gross over-matching shows up here first |
| `coverage` | mean fraction of the query's content terms that a result actually contains |
| `junk` | fraction of results containing *none* of them |
| `junk/query` | the same as an absolute count |

Read `junk` and `junk/query` together: the rate is a ratio, so it can rise while absolute noise falls, simply because the denominator shrank. Term comparison happens in JS against a plural-stripping normalizer (`scripts/text.ts`) rather than a round trip to `_analyze` per term, so it approximates the index-time stemmer.

### Negative queries

The set also carries queries that should return **nothing**, which needs no labels at all:

- `oov` — words verified absent from the corpus (checked at generation time, `df` 0 across `name` and `description`). Any hit is definitionally a false positive.
- `chimera` — the two highest-IDF terms from each of two unrelated agents. No single agent should satisfy all four.

Reported as mean hits and the share returning zero.

**What this does not measure.** These are lexical robustness tests, not intent paraphrase: the queries are derived from the very text being searched, so they cannot tell you whether someone asking for "help me write customer emails" finds the right agent. That needs either LLM-generated queries or real query logs; the file format is just `{query, kind, targetId, targetName}`, so either drops straight in. The other missing half is a **discovery** metric — hold out a user's own usage and check whether group adjacency alone surfaces the agents they actually use. That needs a per-user usage export, which the current export does not produce.

## What the precision metrics showed

- **A quarter of results were junk.** At the default config, `junk` is 0.245 and mean result-set size is 16.5 — for queries built from a single agent's own distinctive terms, against a 341-agent corpus.
- **Every chimera query returns something.** Mean 10.7 hits, and `zeroHit` 0.00 — not one of the 120 four-term chimeras came back empty, though by construction no agent matches all four. `--min-should-match "2<70%"` cuts that to 2.2 mean hits, still only 2% empty.
- **`msm` is a precision fix, not a recall trade.** It was worth +0.024 MRR, which looked marginal. On precision it moves mean hits 16.5 to 2.2, coverage 0.293 to 0.452, and junk/query 1.09 to 0.19 — better on every kind. The known-item metrics had been systematically understating it.
- **The subsequence wildcard was the dominant junk source, and replacing it was free.** It leaked an out-of-vocabulary word — `pelican` matched `PartnerApplicationAnalyzer`, **p**artn**e**rapp**lica**tio**n** — because it matches letters in order anywhere, and long names contain a great many subsequences. Swapping it for `fuzziness: AUTO` fixed that and won on every axis; see below.

## Typo tolerance: fuzzy beats subsequence outright

Comparing the two on `name`, once the eval gained typo queries:

| variant | `name_typo` | `name_transpose` | OVERALL MRR | junk/query | `oov` clean |
| --- | --- | --- | --- | --- | --- |
| `off` | 0.085 | 0.139 | 0.706 | 0.75 | 1.00 |
| `subsequence` | 0.893 | **0.139** | 0.828 | 0.83 | 0.99 |
| `fuzzy` | 0.928 | 0.913 | **0.942** | 0.80 | 1.00 |
| `both` | 0.933 | 0.913 | 0.945 | 0.87 | 0.99 |

The decisive column is `name_transpose`: a subsequence match **requires the letters in order**, so swapping two adjacent characters — the most common real typo — defeats it completely. It scores 0.139, exactly the same as having no fallback at all. Fuzzy handles it at 0.913, costs less junk, and closes the `pelican` leak. `both` buys +0.003 MRR for +0.07 junk/query and reopens that leak, so `fuzzy` is the default.

This only became measurable after adding the typo kinds. The earlier comparison used `name_prefix`, which contains no typos — it is a clean prefix, already handled by `bool_prefix`, so it made the two fallbacks look nearly equivalent and both look nearly redundant.

## What the first runs showed

Against the Dust workspace (2,566 agents, 30-day window):

- **The space filter behaves.** `--q sales` with nothing readable returns 574 hits; adding Company Data takes it to 1,734.
- **Discovery mode works well.** With no query at all, a user in the `Dev` group gets `AVTDustPRReviewPro`, `at_pr`, `AVTGitHubPRDocGen`, `DD` — the agents their colleagues actually use.
- **The two signals are on incompatible scales, and it is expensive.** The eval put a number on it: at `--group-boost 2`, overall MRR@10 is 0.561; at 0, it is 0.904. Exact-name lookup collapses from 0.992 to 0.229 — popular agents outscore the agent you literally named. The default is now 0.5, which costs ~0.01 MRR, but the additive `should` clause is the wrong shape regardless. It wants rank fusion or a normalized popularity feature in a rescorer over the top-N.
- **Compound names did not tokenize — the single biggest win so far.** `name` analyzed `TitleClassifierAI` to one opaque token, so "industry radar" could not find `IndustryRadar`. Adding a `word_delimiter_graph` analyzer took `name_words` from 0.570 to 0.924 MRR and overall from 0.895 to 0.953. Description kinds gave back a little (name tokens now compete for the same queries), a clearly worthwhile trade.
- **Stopwords and stemming were missing entirely.** `reviews` did not match `review`, and `for`/`the` were scored like content words. Adding an English analyzer moved the eval slightly *down* (0.950 to 0.927 without coordination) — expected, since eval queries are drawn from the indexed text and so never suffer the vocabulary mismatch stemming exists to fix. Qualitatively it is what makes `review pull requests` find `CodingRules`.
- **Two precision bugs the eval could not see.** Group adjacency shared a `should` list with the text clauses under `minimum_should_match: 1`, so it satisfied the match by itself and every agent with group usage matched every query. And the `description.subsequence` wildcard matched nearly anything. Together they made `--q invoice` and `--q datadog` return the same agents. Fixing both moved the eval by +0.003 — it measures whether the target ranks, not whether junk ranks with it. `--q invoice` now returns 0 hits.
- **Subsequence wildcards blow up past ~24 characters.** Lucene refuses to determinize the automaton (`would require more than 10000 effort`), and the whole query errors — not just that clause. The clause is also pointless for multi-word input, since the field holds the full name and a space in the pattern demands a literal space in the name. Now gated on both length and token count.
- **Global agents swamp anything usage-weighted.** `dust` alone accounts for 42k of the workspace's messages. `--exclude-global` filters them out.
- **The historical list comparison was close.** With no query, the old profile returned 389 hits, or 341 with `--exclude-global`, against 350 observed in `/manage/agents`. The profile predates pod export support, so those numbers are not a current correctness check.
- **82% of the corpus is dead.** 2,108 of 2,566 agents saw zero messages in the window, and 2,141 are `hidden`. BM25 will happily surface a well-written agent nobody has ever used.
- **Programmatic traffic has no groups.** 25 agents have usage but no group attribution at all (`CodingRules`: 1,568 messages, 0 users) — API-key runs carry no `user.group_ids`, so adjacency scores them zero no matter how popular.
- **Group sums exceed agent totals** by 2-4x, since `user.group_ids` is multi-valued. Good as a per-group signal, wrong as a denominator.

## BM25 parameters: `b` is worth ~0.005 MRR, `k1` is inert

`name`, `description` and `instructions` each carry a named similarity (`name_bm25`, `text_bm25`) so they can be tuned independently. Similarity is a query-time parameter, so changing it needs a close / `PUT _settings` / open cycle — no reindex. `scripts/sweep_bm25.ts` does that and runs the full eval per value:

```
npx tsx scripts/sweep_bm25.ts --similarity name_bm25 --param b --values 0,0.25,0.5,0.75,1 \
  --queries assets/eval_queries_dust.json --profile assets/profile_<id>.json --exclude-global
```

Results over the 2,184-query set:

| | 0 | 0.25 | 0.5 | 0.75 | 1 |
|---|---|---|---|---|---|
| `name_bm25.b` | 0.9443 | **0.9467** | 0.9451 | 0.9425 | 0.9394 |
| `text_bm25.b` | 0.9409 | 0.9427 | **0.9441** | 0.9425 | 0.9422 |

| | 0.5 | 0.9 | 1.2 | 1.6 | 2.0 |
|---|---|---|---|---|---|
| `name_bm25.k1` (b=0.25) | 0.9473 | **0.9475** | 0.9471 | 0.9469 | 0.9464 |
| `text_bm25.k1` (b=0.5) | 0.9474 | 0.9473 | 0.9471 | 0.9471 | 0.9473 |

- **`k1` does nothing here, and that is expected.** `k1` controls term-frequency saturation. Names and descriptions are short enough that a query term appears once, so there is no term frequency to saturate.
- **`b` is real but small.** The `name` curve is monotone in the predicted direction — less length normalization means less advantage for a very short name — but the whole sweep spans 0.007 MRR, and both fields together buy 0.9425 → 0.9475.
- **It does not fix the `help` bug.** Under tuned values `help for PR review` still returns `LegalRequestHelper` first: it matches `help` through the stemmed `helps` in its *description*, so `name` length normalization never enters into it. It does flip `help hiring`, where `Hiring` (30.27) now edges past `LegalRequestHelper` (30.02).
- `hits`, `coverage` and `junk/query` were flat across every sweep, as they must be — BM25 parameters change scoring, not matching.

The index ships at the Lucene defaults (`k1 1.2`, `b 0.75`). A 0.005 gain measured on one workspace, one profile, and queries generated from the indexed text is not enough evidence to bake in; the named similarities and the sweep script are there to redo this against a second corpus.
