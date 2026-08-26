# Working notes

Status of the agent-search harness, what has been measured, and what has not been tried. `README.md` covers how to run things; this file covers where things stand.

## Current state

The harness indexes a workspace export into a local Elasticsearch 8.16.0 (same minor as prod, see `docker-compose.yml`), reproduces the `/manage/agents` permission model at query time, and scores retrieval against a generated query set.

Corpus: 2,566 agents from the Dust workspace, 30-day usage window. For `adrien@dust.tt` the manage view resolves to 389 agents, or 341 with `--exclude-global`.

### Defaults

| Flag | Default | Why |
|---|---|---|
| `--match-mode` | `hybrid` | `best_fields` plus a 0.5-weighted `bool_prefix`. Prefix alone drops IDF on the last term. |
| `--name-fallback` | `fuzzy` | Beats subsequence on transposed characters, 0.913 vs 0.139 MRR, and leaks less. |
| `--group-boost` | `0.5` | At 2.0 popularity outranks exact names and overall MRR falls to 0.561. |
| `--min-should-match` | off | Worth +0.024 to +0.045 MRR but turns vocabulary mismatch into zero hits. |
| `--with-instructions` | off | Instructions are long and drown name and description signal. |

Index: `name` and `description` carry named BM25 similarities (`name_bm25`, `text_bm25`) at Lucene defaults. `name` uses a `word_delimiter_graph` analyzer so `TitleClassifierAI` tokenizes; both text fields use an English stemmer and stopword list.

### Query construction

`scripts/query.ts` builds every query, and both `search.ts` and `eval.ts` call it, so the two cannot drift. Text clauses go in `must`; group adjacency goes in `should`. Keeping them separate matters: when they shared a `should` list under `minimum_should_match: 1`, any agent with group usage matched every query, and `--q invoice` and `--q datadog` returned the same results.

## Tests

There are no unit tests. The eval harness is the regression suite.

```
npx tsx scripts/generate_queries.ts --agents assets/agents_<id>.json --profile assets/profile_<id>.json
npx tsx scripts/eval.ts --queries assets/eval_queries_dust.json --profile assets/profile_<id>.json \
  --exclude-global --compare assets/eval_baseline.json
npx tsgo --noEmit -p .
```

`--compare` prints a delta against the saved baseline, which is metrics only and safe to commit. Everything else in `assets/` is gitignored: exports carry agent instructions, group-level usage, and one person's memberships.

### The query set

2,184 queries across seven kinds, generated from the 341 candidates, plus 228 negatives. Ambiguous strings (75) are dropped when they match more than one agent.

| Kind | Queries | MRR@10 | R@1 | Hits | Junk/query |
|---|---|---|---|---|---|
| name_exact | 339 | 1.000 | 1.000 | 4.4 | 0.16 |
| name_words | 301 | 0.977 | 0.967 | 28.4 | 1.38 |
| name_prefix | 317 | 0.949 | 0.909 | 7.2 | 0.91 |
| name_typo | 325 | 0.928 | 0.923 | 3.9 | 0.18 |
| name_transpose | 313 | 0.913 | 0.907 | 3.7 | 0.17 |
| desc_terms | 294 | 0.924 | 0.864 | 8.7 | 1.98 |
| desc_phrase | 295 | 0.899 | 0.834 | 35.6 | 1.04 |
| **overall** | **2,184** | **0.942** | **0.917** | **12.7** | **0.80** |

Negatives: 108 out-of-vocabulary queries return zero hits every time. 120 chimeras, built from terms of two unrelated agents, average 10.7 hits and never return zero. That is the clearest precision failure the harness has found.

### What the metrics do and don't measure

Each query has exactly one labelled target, so precision has no ground truth. The proxies are result-set size, term coverage (how much of the query each non-target result actually contains), and a junk rate derived from it. They catch gross over-matching and miss ranking subtleties. Progression so far: 0.895 baseline, 0.953 after the name analyzer, 0.927 after the English analyzer (a deliberate drop, since generated queries never suffer the vocabulary mismatch stemming exists to fix), 0.961 with hybrid mode, 0.942 on the expanded set with fuzzy fallback.

## Open paths

### Ranking

- Two-tier retrieval. Run lexical with `--min-should-match "2<70%"`, fall back to semantic when it returns too little, fuse client-side. RRF needs a Platinum license and our cluster is on basic, so fusion has to happen in JS. About fifteen lines for `sum 1/(k+rank)`. Vector search itself (`dense_vector`, `knn`, `int8_hnsw`, `bbq_hnsw`) is free on basic and verified working locally. Start with a stub embedder so the fusion behaviour is measurable before adding a model dependency.
- Coordination. An agent matching only `help` pays nothing for missing `PR` and `review`, because Lucene dropped the `coord` factor under BM25. This is what makes `help for PR review` return `LegalRequestHelper`. `min-should-match` fixes it directly and costs graceful degradation. Nothing else tried so far touches it.
- Popularity as a feature, not a clause. Group adjacency is an additive `should` on a scale unrelated to BM25, which is why the boost has to stay near 0.5. It belongs in a rescorer over the top N, or in rank fusion.
- Field weights. `name^4` and `description^2` were picked by hand and never swept. `sweep_bm25.ts` generalizes to this with small changes.
- Phrase and proximity. `desc_phrase` is the weakest kind at 0.899 and returns 35 hits on average. A `match_phrase` clause on description would help both numbers.
- Recency. 2,108 of 2,566 agents saw zero messages in the window. Nothing in the query penalizes a well-written agent nobody has used.
- Tags. Indexed, never queried.

### Correctness

- The manage-list gap. 341 hits against 350 observed in the UI. Attributed to export drift (the corpus is a 15:47 snapshot, the page was live), but never confirmed with a fresh export taken at the same time.
- `description.subsequence`. Dead weight in the mapping since the clause was dropped. It matched almost anything (`*i*n*v*o*i*c*e*` hits "Incident investigation assistant for Dust using Datadog logs"). Remove it.
- Programmatic traffic. 25 agents have usage and no group attribution, since API-key runs carry no `user.group_ids`. `CodingRules` has 1,568 messages and 0 users, so adjacency scores it zero however popular it is.

### Evaluation

- One workspace, one profile. Every number here comes from a single corpus, and the queries are generated from the indexed text. That is why the BM25 `b` gain of 0.005 was not baked in. A second workspace would tell us which findings generalize.
- No human judgments. Adding even fifty hand-labelled queries with graded relevance would let us measure nDCG and score precision properly instead of by proxy.
- Real query logs. Generated queries are drawn from the corpus, so they systematically understate vocabulary mismatch, which is the failure mode stemming and semantic search exist to address.
