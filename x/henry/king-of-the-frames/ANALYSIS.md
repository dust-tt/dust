# Analysis methodology

The quantitative tally and qualitative review answer different questions. Keep them separate until
the final synthesis.

## Quantitative results

For every matchup, count human slot reactions after excluding the bot's pre-seeded reaction.

- `matchesPlayed`: matchups in which the candidate produced a reviewable Frame.
- `decided`: played matchups with at least one human slot vote.
- `rawVotes`: all human votes assigned to the candidate's slot.
- `outrightWins`: the candidate has the unique highest vote count.
- `tieShare`: `1 / numberOfTiedLeaders` when candidates tie for the highest non-zero count.
- `winRate`: `(outrightWins + tieShare) / decided`.
- `noneVotes`: votes that all Frames are unsuitable. Report separately and never assign to a
  candidate.

Always show `matchesPlayed`, `decided`, and the count of unvoted matchups next to win rate. Using all
posted matchups as the denominator makes lightly reviewed candidates look artificially weak.

## Reliability

Review every Frame, including matchups with no votes. Use a small severity taxonomy:

- `clean`: no material issue.
- `minor-polish`: cosmetic or small usability issue.
- `major-ux`: renders, but has a serious interaction, layout, accessibility, or prompt-adherence issue.
- `broken`: blank, runtime error, missing core data, or unusable.

Track failure tags separately, for example `data-fetch`, `blank-on-load`, `runtime-error`,
`incomplete`, `mobile`, `overflow`, `accessibility`, and `brand-fidelity`. Define tags before the final
rollup and deduplicate synonyms.

## Blind qualitative pass

Analyze by slot before reading `mapping.private.json`:

1. Open every Frame in the same authenticated browser context used by reviewers.
2. Exercise meaningful interactions and responsive layouts.
3. Read the Frame source when available.
4. Review votes, raw comments, and screenshots. A comment can refer to several slots, so do not assign
   comments to candidates with a regex or keyword heuristic.
5. Write one slot assessment per matchup using
   [templates/matchup-analysis-prompt.md](./templates/matchup-analysis-prompt.md).
6. Record severity, failure tags, strengths, evidence, and specific source patterns. If there is no
   useful finding, say so.

Only after the slot documents are complete should an operator join them to candidate IDs using the
private mapping.

## Cost and latency

Export one normalized record per generated conversation to `usage.jsonl`:

```json
{
  "packId": "pack-id",
  "agentId": "agent-candidate-a",
  "conversationId": "conversation-id",
  "modelId": "model-a",
  "frameProduced": true,
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
trusting derived costs. Count only conversations that produced the Frames used in review. Report N,
total, mean, median, and p90 because retries and missing Frames otherwise distort comparisons.

Latency is end-to-end generation time: final run completion minus conversation creation. Use the same
boundary for every candidate.

## Final report

For each candidate include:

- Raw votes, decided win rate, ties, participation, and no-Frame rate.
- Clean/minor/major/broken distribution.
- Latency median and p90.
- Cost mean, median, p90, and total, with the pricing source and effective date.
- Repeated strengths and failure modes, each grounded in matchup IDs, reviewer evidence, and source
  examples.
- Important confounders, including missing Frames, unequal N, auth failures, and viewer-access issues.

Do not identify a winner from aesthetics alone. Reliability, cost, latency, and prompt adherence are
part of the result.
