# Repeating the four model migration eval

Use this workflow to compare Opus 5.5, Opus 5, GPT-6.1 Sol, and GPT-6 Astra on the
same synthesis, Frames, and finance questions. It creates independent conversations,
records costs and timings, and leaves quality judgments to an evidence-based review.
It does not post to Slack, create Google Forms, or change sharing permissions.

This is the small repeated-run study from September 30 to October 2, 2026, not the
earlier 20-question blind triplet experiment. Its final report used **Opus 5 high**
as the incumbent. Repeated generations help measure variability on these tasks;
five attempts at a question are still one distinct question.

## Choose the comparison

The preparation script supports three profiles. Counts below assume three questions
per dataset and five independent conversations per question and configuration.

| Profile | Configurations | New conversations |
| --- | --- | ---: |
| `migration`, default | Opus 5 high; Opus 5.5, Sol 6.1, and Astra at medium and xhigh | 315 |
| `matched` | All four models at medium and xhigh | 360 |
| `extended` | The matched profile plus Opus 5 high | 405 |

The historical study grew in stages and had missing and excluded attempts. These
counts describe a new complete plan, not its historical achieved counts. The script
does not inherit old exclusions, successful outputs, or the old capability probe.

There are two execution groups, `medium` and `xhigh`, because the existing runner
accepts two to five candidates per item. In the migration profile the `medium`
group includes the Opus 5 **high** incumbent. The group directory is not the source
of truth for effort: each candidate's `modelSelection` is.

Historical API selections were:

| Model | Provider ID | Model ID | Efforts used |
| --- | --- | --- | --- |
| Opus 5.5 | `anthropic` | `claude-opus-5-5` | `medium`, `xhigh` |
| Opus 5 | `anthropic` | `claude-opus-5` | `medium`, `high`, `xhigh` |
| GPT-6.1 Sol | `openai` | `gpt-6.1-sol` | `medium`, `xhigh` |
| GPT-6 Astra | `openai` | `gpt-6-astra` | `medium`, `xhigh` |

These are historical identifiers, not a claim about today's availability. Verify
the actual `resolvedModel` in the pilot. Do not silently map `xhigh` to `maximal`,
replace a model, or change effort after a failure. A changed setting is a different
configuration. Provider effort labels do not imply equal compute budgets.

## Inputs and access

Run commands from `x/henry/king-of-the-frames` with Node 22.16 or later. The helper
scripts use Node built-ins and the existing toolkit; no new package install is needed.

You need:

- The same nine frozen prompts, or three agreed replacement questions per dataset.
- An execution agent, historically `dust`, with the same instructions and tools for
  every candidate. Freeze or record its configuration before running.
- A public Dust API key and workspace ID. Use shared tool credentials. Synthesis
  needs its evidence sources; finance needs Snowflake; Frames needs working Frame
  creation. Test those capabilities under API-key authentication, not just in the UI.
- A separate admin export key, the workspace's consumption-export feature, and the
  **name** of the generation API key to collect detailed billing.
- A budget, concurrency limit, retry policy, and quality rubric agreed before launch.

The historical prompt files are local and ignored by Git:

```text
work/mini-eval-2026-09-30/{synthesis,frames,finance}/dataset.jsonl
```

| Dataset | Original item IDs | Tasks |
| --- | --- | --- |
| Synthesis | `q14-a`, `q16-a`, `q13-a` | New LLM router rollout; evaluation-harness maturity; Auto model-selection strategy |
| Frames | `q02-a`, `q01-a`, `q08-a` | Credit consumption by API key; account-book dashboard; stakeholder brief |
| Finance | `q01-a`, `q06-a`, `q11-a` | July ending ARR; regional ARR and seat growth; ARR per paid seat |

For a fresh clone, obtain those three files through an approved private handoff.
Use `--source-root` to point at the parent directory. The helper expects exactly
three distinct, attachment-free rows per dataset in the toolkit's existing JSONL
format. It copies their prompts exactly after the toolkit's normal validation,
replaces their candidates, and records prompt and file hashes.

Preserve the prompts' historical cutoffs. A repeat with live tools can retrieve
different evidence even when prompt hashes match. The Frame context is inline;
do not introduce missing attachments or pretend a later source is a frozen snapshot.

Keep credentials in an ignored, owner-readable file. The existing local file is
`work/text-answer-experiment/credentials.env`. Required variable names are:

```dotenv
DUST_WORKSPACE_ID=<workspace-id>
DUST_ACCESS_TOKEN=<generation-api-key>
DUST_ADMIN_ACCESS_KEY=<admin-export-key>
DUST_CLI_AUTH=0
```

Never print or commit their values. The admin key is for read-only billing export,
not a way to give generation runs broader tool permissions. Check that stale shell
variables do not override the intended values in `node --env-file`.

## Prepare without launching

Choose a new destination under ignored `work/`. The preparation script refuses an
existing destination, even an empty one. It never calls Dust.

```bash
EVAL_ROOT="$PWD/work/premium-comparison-2026-10-08"
EVAL_CREDENTIALS="$PWD/work/text-answer-experiment/credentials.env"

node src/prepare-mini-eval.mjs \
  --out "$EVAL_ROOT" --profile migration --repeats 5 \
  --concurrency 8 --seed premium-comparison-v1 --dry-run

node src/prepare-mini-eval.mjs \
  --out "$EVAL_ROOT" --profile migration --repeats 5 \
  --concurrency 8 --seed premium-comparison-v1
```

Use `--profile matched` for the four-model medium/xhigh comparison, or `extended`
to include all nine historical configurations. Use `--repeats 1` for a small,
separate study, not to edit an already-started five-repeat plan.

The script writes `manifest.json`, `events.jsonl`, and six dataset/config pairs.
It shuffles item and candidate queue order with a recorded seed. That seed controls
allocation order, not the model's randomness. All repeats use fresh conversations.

```text
<study>/
  manifest.json
  events.jsonl
  medium/{synthesis,frames,finance}/
    dataset.jsonl
    config.json
    run/                         created by the runner
    data/                        created by the billing collector
  xhigh/{synthesis,frames,finance}/
    ...
```

Do not edit the frozen datasets/configs after preparation. The summary helper checks
their hashes. If a setting must change, prepare a new plan and retain both manifests.

## Pilot before the full run

This step creates real, billable conversations. Start one question per dataset and
execution group. That covers all seven migration configurations on each task type,
21 conversations total, and counts toward the prepared plan.

```bash
for cohort in medium xhigh; do
  for dataset in synthesis frames finance; do
    case "$dataset" in
      synthesis) pilot_item=q14-a ;;
      frames) pilot_item=q02-a ;;
      finance) pilot_item=q01-a ;;
    esac
    batch="$EVAL_ROOT/$cohort/$dataset"
    node --env-file="$EVAL_CREDENTIALS" src/run-eval.mjs \
      --dataset "$batch/dataset.jsonl" --config "$batch/config.json" \
      --out "$batch/run" --log "$batch/events.jsonl" \
      --only-item "$pilot_item"
  done
done
```

Those IDs assume the historical source files. For replacement questions, use an ID
from each prepared dataset. Check the pilot conversations and collect billing before
continuing:

1. The original message's provider, model, and effort match the request.
2. Each agent can actually retrieve evidence or create its Frame with the configured
   credentials. A fluent refusal is not a successful substantive answer.
3. There are no pending authentication or approval actions. Do not deny them to force
   completion or broaden permissions without authorization.
4. Text answers are saved. A Frame has a working published artifact, not merely code
   or a file-download URL. Inspect at least one rendered Frame and its interactions.
5. Costs and durations exist, and the pilot is within budget.

If a Frame exists but its sharing URL was not saved, the existing resolver can
retrieve it. It may send a new agent follow-up, so run this only when that sharing
step is authorized, after freezing the original answer. It does not belong in a
read-only status check:

```bash
node --env-file="$EVAL_CREDENTIALS" src/resolve-frame-share-urls.mjs \
  --run "$EVAL_ROOT/medium/frames/run" \
  --log "$EVAL_ROOT/medium/frames/events.jsonl"
```

Repeat for `xhigh/frames` if needed. Use the resulting `frameShareUrl`, not
`frameFileUrl`, for review. Recollect billing afterward and keep follow-up costs
separate. Never bypass an authentication requirement to obtain the link.

`requireModelAudit` in config is not proof that generation used the right model.
Verify the returned model. The runner's zero exit status and "Done" message also
do not mean all planned cells produced a usable answer.

## Run the remaining cells

After a successful pilot, the same runner skips saved outputs and resumes saved
conversation IDs. Run the six independent directories in parallel if the approved
budget and rate limits allow it:

```bash
for cohort in medium xhigh; do
  for dataset in synthesis frames finance; do
    batch="$EVAL_ROOT/$cohort/$dataset"
    node --env-file="$EVAL_CREDENTIALS" src/run-eval.mjs \
      --dataset "$batch/dataset.jsonl" --config "$batch/config.json" \
      --out "$batch/run" --log "$batch/events.jsonl" \
      > "$batch/execution.log" 2>&1 &
  done
done
wait
```

With concurrency 8, this allows up to 48 in-flight cells across six processes.
The runner starts a new cell when a worker frees up; it does not launch the whole
315-cell plan at once. Its per-process maximum is 32. Set the limit deliberately
at preparation time. There is no global rate limiter or spend cutoff.

Run this block only once while those processes are active. Logs and cells have no
cross-process lock. Never start two writers for the same `run/` directory. On a
restart, preserve the previous `execution.log` before using shell redirection again.
The per-batch `events.jsonl` is append-only and records UTC timestamps.

## Check progress and recover safely

This command is local and read-only. It does not launch or retry anything:

```bash
node src/summarize-mini-eval.mjs --study "$EVAL_ROOT"
```

It reports pending cells, uncertain creations, saved outputs, model verification,
and billing coverage. It is a snapshot, not a live API check. Before rerunning a
batch, confirm the old process is stopped and inspect its saved IDs and event log.

The runner's 15-minute timeout stops local collection, not the Dust conversation.
Resume a still-running saved ID with the same batch command; do not create a new
conversation just because collection timed out. Check original messages before
adding follow-ups, which can change what a later collector considers the output.

For a confirmed terminal provider or transport failure, record the reason and keep
the old cell, result history, ID, and billed cost. An approved new attempt should use
a separate recovery directory and both `--only-item` and `--only-candidate` filters.
For example, after confirming the exact failed cell:

```bash
batch="$EVAL_ROOT/medium/synthesis"
node --env-file="$EVAL_CREDENTIALS" src/run-eval.mjs \
  --dataset "$batch/dataset.jsonl" --config "$batch/config.json" \
  --out "$EVAL_ROOT/recovery/router-sol-attempt-2/run" \
  --log "$EVAL_ROOT/recovery/router-sol-attempt-2/events.jsonl" \
  --only-item q14-a --only-candidate gpt-6-1-sol-medium
```

Set a retry cap before launch. Do not use `--force`, delete failed cells, replace
original attempts with the best retry, or change effort under an existing ID.
The summary helper covers the original plan only. Export and report recovery
attempts separately, with their parent cell and reason.

A lost creation response is different from a confirmed failure. If an event says
creation started but no ID was saved, or `creationUncertain` is set, reconcile the
public conversation/billing evidence first. Lack of an ID is not evidence that the
request did nothing. Do not duplicate an uncertain request without approval.

## Collect credits and timing through the public API

Use the shared collector, not the historical hard-coded audit scripts. This API
operation reads billing data; it does not create conversations. Set the API key
**name**, not its secret value:

```bash
EVAL_API_KEY_NAME='<exact name of the generation API key>'
for cohort in medium xhigh; do
  for dataset in synthesis frames finance; do
    batch="$EVAL_ROOT/$cohort/$dataset"
    node --env-file="$EVAL_CREDENTIALS" src/collect-step-costs.mjs \
      --run "$batch/run" --out "$batch/data" \
      --api-key-name "$EVAL_API_KEY_NAME" \
      --log "$batch/events.jsonl"
  done
done
```

The collector calls public `/api/v1` conversation and consumption-export endpoints.
It keeps known eval conversation IDs and writes:

- `consumption-rows.private.jsonl`: raw billed rows, including model/tool credits.
- `step-costs.private.json`: original-message versus follow-up records, actual
  model selection, step counts, tool calls and timings, and reconciliation status.

Refresh after completion because billing export can lag. `not-yet-exported` is not
zero cost or zero work. Require `matched` reconciliation before treating step cost
as complete. Message completion duration is the primary latency measure; collection
wall time includes interruptions. Exported LLM execution time of zero is not a
measurement. Tool durations can overlap, so their sum is not elapsed time.

Use original-message credits plus reported subagent credits for generation cost.
Keep follow-up and recovery costs separate and also report the total observed bill.
The collector does not recursively retrieve every delegated conversation, and
unidentified creation requests may remain unpriced. State those coverage gaps.

The older `collect-run-audit.mjs` also probes a private consumption route. It is
not needed for this public-API-only recipe.

The collector refreshes its two output files in place. Before refreshing a snapshot
already used in analysis, retain it in a dated private directory. Do not overlap
collectors or read the files while another process is replacing them.

## Export a frozen measurement snapshot

```bash
node src/summarize-mini-eval.mjs --study "$EVAL_ROOT" \
  --out "$EVAL_ROOT/snapshot-001"
```

The destination must be new. This produces `attempts.csv`, `summary.csv`, and
`snapshot.json`. No source cells, reviews, or earlier reports are edited.

`attempts.csv` includes each planned cell, saved conversation and original message
IDs, actual-model agreement, output-recorded status, original and follow-up credits,
latency, tool counts, prompt hashes, and audit timestamp. Missing values stay blank.

`summary.csv` reports counts and descriptive cost/latency by dataset and
configuration. Its cost sample includes known, model-matched terminal original
messages with reconciled billing, including failed outputs. It does **not** infer
which answers are assessable or reproduce the old report's manual exclusions.
Check `allPlannedCostsMeasured` and question coverage before interpreting a mean.

Equal-question means first average observed repeats within each question, then
average the three question means. No mean is emitted when an entire question is
missing. This avoids silently giving frequently completed questions more weight.

## Review quality and produce the analysis

Keep quality, reliability, cost, and latency separate. More words, steps, citations,
or successful API completion are not quality labels.

For each answer, record configuration, question, repeat, original message ID,
assessment, evidence, and reviewer. Use distinct fields for:

- Produced the requested output, including a usable Frame rather than source code.
- Substantive and assessable, versus a refusal or an access-blocked non-answer.
- Factual correctness, numerical consistency, completeness, and source/cutoff fit.
- Presentation and rendered Frame functionality.

Retain incorrect but assessable answers. Excluding mistakes makes apparent quality
and cost look better. If non-answers are excluded from a conditional cost comparison,
show the exclusion counts and all-attempt cost/reliability beside it. Preserve the
original cohort; recovery results are a separate sensitivity.

The previous migration report used a non-blinded trace audit and a retrospective
finance checklist, not an aggregate human-quality score. To repeat that approach,
inspect repeat 1 for every configuration/question systematically, then label any
targeted extra inspections separately. Trace claims to saved retrievals, SQL results,
and arithmetic. Do not present an unblinded, targeted case sample as an error rate.

For stronger quality conclusions, agree on a rubric first and collect independent,
blinded reviews on frozen outputs. Keep a private candidate mapping. Do not discount
matching reviews just because reviewers agreed, and do not force higher effort to
score better. Slack and Forms publication require a separate explicit step; see
[OPERATIONS.md](./OPERATIONS.md) for the larger human-ranking workflow.

For the migration cost analysis:

1. Use Opus 5 high as reference only in profiles that include it. Report each dataset
   separately. A cross-dataset spend estimate needs explicit workload shares.
2. Average repeats within question, questions within dataset, then datasets using
   the declared shares. Use means for additive spend; show median and p90 latency.
3. For the same fixed tasks, resample observed repeats within configuration/question.
   To explore question-mix sensitivity, also resample question IDs within each
   dataset, using the same selected question IDs for candidate and reference.
4. Keep repeat samples independent across configurations. Repeat 2 is a bookkeeping
   index, not a shared random seed. A duplicated bootstrap question reuses its
   resampled mean. The historical cost report used 20,000 draws and a fixed seed.
5. Report fixed-task intervals separately from question-mix sensitivity. With only
   three questions per dataset, neither establishes production-wide performance.
   A cost interval is not a quality interval.

Live evidence, auth problems, cohort dates, nonrandom task selection, missing
attempts, and retries all limit interpretation. Include these beside the relevant
result, not just in a footnote. Never modify the scoring method to obtain a desired
model order.

## Historical references and handoff

All paths below are under `work/mini-eval-2026-09-30/` and are private local artifacts:

| Path | Role |
| --- | --- |
| `prepare.mjs`, `prepare-opus-5.mjs` | Original pilot and Opus 5 addendum history |
| `repeat-study/README.md`, `prepare.mjs`, `build-report.mjs` | Medium repeat design, exceptions, per-attempt/step/action exports |
| `opus-5-high-study/prepare.mjs` | Added incumbent high-effort comparison |
| `xhigh-study/README.md`, `prepare.mjs`, `build-report.mjs` | Four-model xhigh cohort and cost/reliability outputs |
| `migration-decision-2026-10-02/analyze.py` | Frozen cohort assembly, equal-question cost summaries, bootstrap sensitivities |
| `migration-decision-2026-10-02/read-traces.mjs` | Trace collection for qualitative review |
| `migration-decision-2026-10-02/analyze-comparisons.py`, `analyze-ablations.py` | Study-specific comparison and sensitivity analyses |
| `migration-decision-2026-10-02/migration-report.tex` | Final decision report with methodology and limitations |

Those scripts contain dated paths, exceptions, reused IDs, or handwritten judgments.
Read them as provenance. Do not execute them as generic new-run scripts or overwrite
the old report. The new preparation and summary helpers are the reusable entry points.

A useful handoff contains the frozen manifest and prompt inputs, raw run and billing
records, a CSV of quality annotations, derived CSVs, a methods note, a results report,
and the recovery log. Keep credentials and private raw traces out of a reader-facing
ZIP. Keep runnable scripts separately from the digestible results bundle.
