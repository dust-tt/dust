# Skill tagging experiments

Assign every workspace skill a small set of tags from a predefined, faceted taxonomy, then
measure how well those tags segment the skills and how closely tag similarity tracks the
embedding similarity from `../skill-embeddings`. Everything lives in this directory; no
application changes or running Dust services are required.

Run from a Dust checkout with its usual Node dependencies installed. The local `package.json`
records the libraries used, which are already present in the repository's dependency tree. The
CLI reuses the skill extraction and embedding-file reader of `../skill-embeddings`.

## Taxonomy

`taxonomy.ts` declares eight facets. Each facet is a closed vocabulary with a cardinality and a
weight used in tag similarity:

| Facet      | Tags | Cardinality | Weight | What it captures                                            |
| ---------- | ---- | ----------- | ------ | ----------------------------------------------------------- |
| `function` | 15   | 1–2         | 1.0    | Owning business function (sales, support, people-talent...) |
| `task`     | 18   | 1–3         | 1.0    | Kind of work (draft, review, research, build-visual...)     |
| `subject`  | 30   | 1–3         | 1.2    | Entity worked on (deal, candidate, credits, brand...)       |
| `output`   | 14   | 1–2         | 0.6    | Deliverable form (frame, deck, email draft, CRM record...)  |
| `systems`  | 26   | 0–6         | 0.5    | Systems actually read or written (HubSpot, Slack...)        |
| `audience` | 3    | 1–2         | 0.4    | Self, internal team, or customer-facing                     |
| `trigger`  | 4    | 1           | 0.3    | On demand, scheduled, sub-skill, or always-on guideline     |
| `quality`  | 3    | 1           | 0      | Substantive, thin, or test placeholder                      |

The facets were chosen from a read of the 547 active skills of the Dust workspace: the data is
dominated by GTM work (sales, customer success, partnerships, growth prospecting), with large
families of brand-image skills, personal operating systems, hiring, support, product rituals, and
engineering tooling. `function` alone cannot separate, say, a cold-email drafter from a pipeline
analysis; `task` and `subject` carry that distinction. The model also returns a one-sentence
summary, a confidence level, and up to three free-text `uncoveredAspects` keywords that name what
the taxonomy cannot express; those keywords feed the "Taxonomy gaps" report to guide the next
taxonomy version. Any change to `taxonomy.ts` changes the taxonomy hash and requires a new
`--out` directory, so earlier snapshots are never overwritten.

## Run

Set `ANTHROPIC_API_KEY`, then build the whole pipeline from a saved embeddings file:

```sh
node --import tsx x/aubin/skill-tags/cli.ts run \
  --from-embeddings x/aubin/skill-embeddings/output/YOUR_WORKSPACE_ID/embeddings.json
```

Or snapshot skills directly from the public API with `DUST_API_KEY` set:

```sh
node --import tsx x/aubin/skill-tags/cli.ts snapshot --workspace YOUR_WORKSPACE_ID
node --import tsx x/aubin/skill-tags/cli.ts run --workspace YOUR_WORKSPACE_ID
```

Open `x/aubin/skill-tags/output/YOUR_WORKSPACE_ID/index.html` in a browser. It is
self-contained and works offline. Generated output is gitignored. It contains skill
instructions and must be treated like the underlying workspace data.

Stages can run one at a time: `snapshot`, `tag`, `stability`, `evaluate`, `report`. Use
`--limit 20` on `tag` for a smoke test, `--sample 0` to skip the stability stage, and `--help`
for every option. The default model is `claude-opus-5` with `--effort medium`; structured
outputs constrain each facet to its enum, cardinality is validated after parsing with one
corrective retry, and the taxonomy prompt is cached across requests. Bracketed team labels such
as `[GTM]` are stripped from names before tagging (`--keep-name-prefix` disables this) so they
can serve as held-out ground truth for the `function` facet.

## What gets saved

| File             | Contents                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `skills.json`    | Input snapshot: id, name, description, instructions, enabled tools, text hash, tokens     |
| `taxonomy.json`  | The taxonomy version, hash, and facets used for this output directory                    |
| `tags.json`      | Per skill: tags per facet, summary, confidence, uncovered aspects, input hash, usage      |
| `stability.json` | A second tagging pass over a seeded sample, for agreement metrics                        |
| `metrics.json`   | Every metric below plus top-10 embedding neighbors per skill when a reference exists      |
| `index.html`     | Offline explorer and metrics report, including its data                                  |

`tags.json` is written before the first model call and after every completed skill, so an
interrupted run resumes where it stopped. Entries are reused only when the skill text, model,
effort, prompt, taxonomy, name masking, and instruction budget are unchanged. Instructions
longer than `--instruction-budget` cl100k tokens (default 6000) are truncated for tagging with
an explicit marker; the snapshot keeps the full text.

## Tag similarity and search

`similarity.ts` defines two similarities over tag sets. `idf-cosine` is the cosine of binary tag
vectors where each tag weighs `facetWeight × ln(N / df)`, so a tag carried by most skills
contributes little and a rare shared tag counts a lot. `jaccard` is the facet-weight-averaged
Jaccard index, skipping facets where neither skill has a tag. Search is a conjunction: a query is
a set of `(facet, tag)` pairs and matches skills carrying every pair. The explorer's left panel
shows, for each remaining tag, how many matching skills carry it, so the user can watch the
bucket shrink as tags are added.

## Metrics

The goal is that small subsets of tags narrow down to genuinely similar skills. Metrics come in
four groups; all are in `metrics.json` and on the report's Metrics tab.

**Taxonomy health** (per facet): coverage, mean tags per skill, distinct tags used, normalized
entropy of the tag distribution, dominant tags (more than 40% of skills), rare tags (fewer than
3 skills), and the share of skills reporting `uncoveredAspects` with the most frequent keywords.

**Segmentation** (no external reference): bucket statistics for single tags, for every
cross-facet pair among `function`, `task`, `subject`, `output`, and for the
`function × task × subject` triple. A bucket is the set of skills carrying every tag of a
conjunction; a "tight" bucket has 2 to 10 skills. The narrowing curve follows the search path
`function → subject → task → output` using each skill's primary tags and reports the median bucket
size at each depth, the share of skills already within 5 skills, and the depth at which each
skill first reaches that target. Skills with identical weighted tag sets are listed as
collisions, with their mean embedding cosine when a reference exists, to tell near-duplicates
from under-specified tags.

**Agreement with embeddings** (when an `embeddings.json` from `../skill-embeddings` covers the
same workspace): neighbor overlap@k between tag neighbors and cosine neighbors against the
random baseline `k / (N - 1)`; Spearman correlation between tag similarity and cosine over all
pairs; mean cosine of a skill's top-5 tag neighbors compared with the global mean and with the
oracle (its true top-5 cosine neighbors); tag similarity to a skill's embedding neighbors versus
random skills; per-tag semantic cohesion (mean within-tag cosine, lift over the global mean, and
a z-score against 30 random groups of the same size); and bucket cohesion, the mean cosine lift of
tag-conjunction buckets of at least 3 skills.

**Known groups**: bracketed team labels map to expected `function` tags (`[GTM]` → sales or
customer-success, `[Talent]` → people-talent, ...) and give an accuracy on labeled skills. Name
families defined by regular expressions (brand-image skills, `Frank OS —`, `VP of Sales`,
`Query … API`, ...) report within-family mean tag similarity against the global mean, the modal
tag and its purity for `function`, `task`, `subject`, and the family's mean embedding cosine.

**Stability**: a seeded sample is tagged a second time with the same setup; per facet the mean
Jaccard, exact-match share, and primary-tag match share are reported, plus the share of skills
whose weighted facets all match.

## Files

| File            | Role                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `taxonomy.ts`   | Facets, tags, cardinalities, weights, taxonomy hash                     |
| `data.ts`       | Snapshot schema and builders, tagging input composition and masking     |
| `tagging.ts`    | System prompt, structured output schema, validated and checkpointed tagging |
| `similarity.ts` | Tag space, IDF weights, similarities, neighbors, conjunction search      |
| `metrics.ts`    | All metrics, embedding reference, known-group definitions                |
| `cli.ts`        | Stage orchestration and report generation                               |
| `viewer.*`      | Offline explorer and metrics report                                     |

## Results on the Dust workspace, taxonomy v1 (2026-09-19)

547 active skills, `claude-opus-5` at medium effort, names masked, one refusal served by the
`claude-opus-4-8` fallback, one corrective retry, estimated cost $19.

**Taxonomy health.** Every tag of every facet is used. `function`, `task`, `subject`, and
`output` have no dominant tag and normalized entropies of 0.83–0.93. The catch-all tags are the
weak spot: `function:general` covers 18% of skills and `subject:other` 7%, and both are the least
semantically cohesive tags in the reference comparison (z of -6.1 and -5.5). 54% of skills report
an uncovered aspect, but no keyword appears more than 3 times, so the gaps are long-tail
specifics rather than a missing category.

**Segmentation.** A single facet never narrows below a median of 30 skills. Two facets do:
`task × subject` buckets have a median size of 4 and put 79% of skills in a bucket of 2–10 skills.
Along the primary-tag search path `function → subject → task → output` the median bucket goes
75 → 26 → 7 → 3; after three tags 45% of skills sit in a bucket of at most 5 and 65% in one of at
most 10, while 37% never reach 5 along that path (large sales and customer-success families).
532 distinct tag sets over 547 skills; the 12 collision groups have a mean embedding cosine of
0.59–0.91 against a global mean of 0.49, so they are mostly genuine near-duplicates.

**Agreement with `text-embedding-3-large`.** Top-5 tag neighbors overlap the top-5 embedding
neighbors 21% (idf-cosine) and 24% (jaccard) of the time against 0.9% at random; Spearman over
all pairs is 0.32. The top-5 tag neighbors have a mean cosine of 0.61–0.63, halfway between the
global mean (0.49) and the embedding oracle (0.74). Tag similarity to a skill's embedding neighbors
is 4.4× its similarity to random skills. Conjunction buckets get semantically tighter as facets
are added: mean cosine lift 0.05–0.08 for single tags, 0.09–0.12 for pairs, 0.13 for the
`function × task × subject` triple, with 94–96% of buckets above the global mean. Plain Jaccard
beats the IDF-weighted cosine on every reference metric.

**Known groups.** With team labels hidden, the predicted function matches the label for 89.5%
of the 181 labeled skills; misses concentrate in `[Utils]` and `[Design]`. Brand-image skills
have a within-family tag similarity of 0.77 (global 0.10) with 95–100% purity on
function/task/subject; personal families (`Frank OS`, `EK`, `TV`) are pure on audience but
spread across tasks, as intended.

**Stability.** On 40 re-tagged skills the primary tag matches in 95–100% of cases per facet and
the full weighted tag set is identical for 52%; disagreement is in secondary `subject` and `task`
tags.

**Next taxonomy iteration.** Split `function:general` (writing utilities versus thinking
partners versus formatting modes) and `subject:other`, reconsider the weight of `output`, and
keep Jaccard as the default similarity.
