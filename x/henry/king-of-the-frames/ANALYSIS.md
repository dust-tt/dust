# Analysis methodology

The quantitative tally and qualitative review answer different questions. Keep them separate until
the final synthesis.

## Quantitative results

For ranking reviews, retain each reviewer's complete ordered slot list. The descriptive tally reports:

- `rankingCount`: valid complete rankings containing the candidate.
- `firstPlaceVotes`: rankings that put the candidate first.
- `averageRank`: mean position across complete rankings.
- `pairwiseWins` and `pairwiseWinRate`: all ordered candidate pairs implied by the full rankings.

Do not treat the implied pairwise outcomes from one ranking as independent observations in a
statistical model. Fit the complete rankings directly when producing an overall model comparison.

When several people rank the same outputs, optionally discount redundant agreement rather than
treating every co-review as fully independent. The implemented weight is
`1 / (1 + discount × summed majority pairwise agreement with same-thread rankings)`. Similarity is
the share of implied pairwise preferences that agree, but only when that share exceeds one half. With
a discount of `2/3`, two identical rankings contribute 1.2 effective rankings, and rankings that
differ by one adjacent swap contribute about 1.38. Rankings without a majority of pairwise agreement
retain full weight. Report both the raw and effective ranking counts, keep the same weights inside the
question-clustered bootstrap, and run a reasonable discount-strength sensitivity check.

For winner reviews, count human slot reactions after excluding the bot's pre-seeded reaction. The
compatibility metrics, also populated from first-place choices in ranking mode, are:

- `matchesPlayed`: matchups in which the candidate produced a reviewable output.
- `decided`: played matchups with at least one human slot vote.
- `rawVotes`: all human votes assigned to the candidate's slot.
- `outrightWins`: the candidate has the unique highest vote count.
- `tieShare`: `1 / numberOfTiedLeaders` when candidates tie for the highest non-zero count.
- `winRate`: `(outrightWins + tieShare) / decided`.
- `noneVotes`: votes that all outputs are unsuitable. Report separately and never assign to a
  candidate.

Always show `matchesPlayed`, `decided`, and the count of unvoted matchups next to win rate. Using all
posted matchups as the denominator makes lightly reviewed candidates look artificially weak.

## Reliability

Review every output, including matchups with no votes. Use a small severity taxonomy:

- `clean`: no material issue.
- `minor-polish`: cosmetic or small usability issue.
- `major-ux`: renders, but has a serious interaction, layout, accessibility, or prompt-adherence issue.
- `broken`: blank, runtime error, missing core data, or unusable.

Track failure tags separately, for example `data-fetch`, `blank-on-load`, `runtime-error`,
`incomplete`, `mobile`, `overflow`, `accessibility`, and `brand-fidelity`. For live-tool research, also
track `retrieval-miss`, `source-quality`, `source-cutoff`, `tool-error`, and `permission-error`. Define
tags before the final rollup and deduplicate synonyms.

## Blind qualitative pass

Analyze by slot before reading `mapping.private.json`:

1. Open every output in the same authenticated context used by reviewers.
2. Exercise meaningful interactions and responsive layouts.
3. Read the output source when available.
4. Review votes, raw comments, and screenshots. A comment can refer to several slots, so do not assign
   comments to candidates with a regex or keyword heuristic.
5. Write one slot assessment per matchup using
   [templates/matchup-analysis-prompt.md](./templates/matchup-analysis-prompt.md).
6. Record severity, failure tags, strengths, evidence, and specific source patterns. If there is no
   useful finding, say so.

Only after the slot documents are complete should an operator join them to candidate IDs using the
private mapping.

For live-tool experiments, the output ranking evaluates the whole system, including retrieval. After
freezing the blind output assessments, inspect the corresponding conversation traces and record which
Slack, Notion, and Drive evidence was selected, whether date cutoffs were followed, and which tool calls
failed. Treat different retrieved evidence as model behavior, while reporting changing source data or
unequal permissions as experimental confounders.

## Cost and latency

### Dust credits (primary metric)

Use the public API's billed credits, not a historical token-price table. The
[runbook](./RUNBOOK.md#14-export-usage-and-compute-costlatency) documents conversation and step-level
exports. Keep the raw rows and per-message reconciliation in the experiment's private `data/` folder.

Report generation-only cost using the original answer message, including its nested-agent charges
where applicable. Report later Frame-sharing helper messages and failed/retried attempts separately
as operational spend. Reconcile `totalCredits` to message billing, allowing export rounding and
indexing delay. Gross credit components need not sum to reconciled credits. Do not assume nested
conversation coverage is complete merely because the root message reconciles.

Use the original message's `completionDurationMs` for answer latency and retain
`modelInteractionDurationMs` separately. Exported LLM-step durations of zero are unavailable
measurements, not zero latency; parallel tool durations cannot simply be added to derive wall time.

**Current analysis boundary:** `analyze-rankings.mjs` reads the conversation audit, not the step-cost
export. Its cost summary can include later helper messages, and its `latencyMs` comes from local cell
timestamps, which can include polling/resume delays. Use the message-level fields for a final
generation-only comparison; do not relabel the generic summary as that comparison without adapting
the analysis. Its named effort-pair section also retains historical candidate IDs and needs checking
for new model lists. Preserve raw audit data when deriving corrected reporting inputs.

### Provider-dollar estimates (optional)

Export one normalized record per generated conversation to `usage.jsonl`:

```json
{
  "packId": "item-id",
  "agentId": "agent-candidate-a",
  "conversationId": "conversation-id",
  "modelId": "model-a",
  "outputProduced": true,
  "startedAt": "2026-01-01T10:00:00Z",
  "completedAt": "2026-01-01T10:02:00Z",
  "freshInputTokens": 1000,
  "cacheReadTokens": 4000,
  "cacheWriteTokens": 0,
  "outputTokens": 2000,
  "recordedCostMicroUsd": 12345
}
```

Gather it through an approved read-only path. The usual ownership chain is generated conversation to
agent messages, run IDs, runs, and run-usage rows. Join run IDs by unnesting them and using equality on
the indexed run identifier. Do not issue a broad production scan.

Normalize provider counters before using the script. Some provider payloads report total prompt tokens
with cache tokens already included. Convert that representation into disjoint
`freshInputTokens`, `cacheReadTokens`, and `cacheWriteTokens`; never add cache counters on top of an
inclusive prompt total.

The calculator applies:

```text
fresh input * input rate
+ cache read * cache-read rate
+ cache write * cache-write rate
+ output * output rate
```

Use the exact model and price effective at evaluation time. Experimental models can have placeholder
recorded costs, so validate the normalized formula against a production-priced control model before
trusting derived costs. Count only conversations that produced the outputs used in review. Report N,
total, mean, median, and p90 because retries and missing outputs otherwise distort comparisons.

For this legacy normalized export, latency is final completion minus conversation creation. Label it
separately from API message execution duration and use the same boundary for every candidate.

## Final report

For each candidate include:

- Complete-ranking participation, first-place count, average rank, pairwise descriptive rate, and any
  fitted ranking-model estimate. For legacy winner reviews, include raw votes and decided win rate.
- Ties, `none suitable` responses, and no-output rate.
- Clean/minor/major/broken distribution.
- Latency median and p90.
- Cost mean, median, p90, and total, with the pricing source and effective date.
- Repeated strengths and failure modes, each grounded in matchup IDs, reviewer evidence, and source
  examples.
- Important confounders, including missing outputs, unequal N, auth failures, and viewer-access issues.
- For live-tool experiments, retrieval quality, tool failures, source coverage, and cutoff adherence.

Do not identify a winner from aesthetics alone. Reliability, cost, latency, and prompt adherence are
part of the result.
