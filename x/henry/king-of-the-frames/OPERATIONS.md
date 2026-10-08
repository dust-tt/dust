# Running our evals

Start here for prerequisites and operating decisions. [RUNBOOK.md](./RUNBOOK.md) is the command
reference, [SAMPLING.md](./SAMPLING.md) explains the allocation, and [ANALYSIS.md](./ANALYSIS.md)
defines the metrics. Run commands from `x/henry/king-of-the-frames` with Node 22+.

## What the operator needs

| Input | Required detail |
| --- | --- |
| Questions | Final prompts, numbered 1–20 for the balanced design; accessible original files, if any. No unresolved “attached” references. |
| Output type | One per dataset: `answer` saves the agent's final text as Markdown; `frame` requires a generated Frame and its sharing URL. |
| Evidence mode | Live tools with equal access for every configuration, or fixed self-contained evidence. Record source scope and date cutoff. |
| Candidates | Stable private ID, execution `agentId`, label, and exact `modelSelection` (`providerId`, `modelId`, `reasoningEffort`). |
| Dust access | Workspace ID, generation API key, agent access, and working shared credentials for all required tools. |
| Slack destination | A separate channel ID per experiment and a bot that belongs to that channel. |
| Reviewers | Eight stable reviewer IDs or aliases with a private alias-to-person mapping. |
| Review collection | A verified private Google Form, response owner, and review deadline. Slack distributes outputs, not rankings. |
| Run policy | Recorded seed, concurrency, retry/exclusion rules, budget, and analysis choices agreed before seeing results. |
| Detailed costs | Separate admin API key, `consumption_export_api` enabled on the workspace, and the generation API key's **name** for filtering. |

Do not assume a provider's “max” or default effort is a valid Dust API value. Check the current Dust
model registry and verify the returned `resolvedModel` in the pilot. Two effort labels must not map
to the same setting. The current runner uses the public API, not CLI authentication.

### Workload and terminology

One configuration is one model × reasoning effort. One question is an underlying task; one triplet
is three outputs for that question. One ranking is one person's ordering of those three outputs.

For four models × two efforts and eight reviewers, **per dataset**:

- 20 questions, each used in two disjoint triplets: 40 review threads and 120 generated answers.
- Two reviewers per thread: 80 rankings, ten triplets (30 outputs) per reviewer.
- Each configuration answers 15 questions; every configuration pair co-occurs four or five times.
- One fixed round, not two sequential waves. Two triplets per question do not mean two rounds.

Two datasets therefore mean 20 triplets per reviewer. Analyze datasets independently. Balanced
allocation improves efficiency but does not guarantee narrow confidence intervals.

## Find the existing run before starting anything

Real data is local and ignored by git. In this workspace, the September rerun is under
`work/rerun-2026-09-28/`; its `README.md` and `plan.json` record the datasets, candidates, channel
variables, and holds. The credential file is `work/text-answer-experiment/credentials.env`.
These private files are **not included in a fresh clone**; obtain them through an approved handoff.

Within each experiment directory:

| Location | Purpose |
| --- | --- |
| `dataset.jsonl`, `config.json`, `manifest.private.json` | Frozen prompts, exact candidates, sampling seed, and question-to-triplet mapping. |
| `reviewer-assignments.private.json` | Who reviews each thread; keep the identity mapping private. |
| `run/cells/`, `run/results.jsonl` | Conversation IDs, current cell state, and attempt history. |
| `run/prepublication-audit.private.json` | Actual versus requested model/effort, terminal status, credits, and timing. |
| `review/mapping.private.json` | Stable anonymous slot-to-candidate mapping. Never send to reviewers. |
| `review/posted.private.json`, `review/posting-state.private.json` | Slack destinations and posting progress; required to avoid duplicates. |
| `data/` | Raw cost exports and normalized review data. |
| `reports/` | Human-readable analysis; keep separate from raw data. |
| `events.jsonl` | Append-only record of preparation, generation, recovery, publication, and audits. |
| `execution-status.json`, `execution.log` | Progress and errors for the local supervised runner. |

Do not start a second writer against an active run. Read status and logs, and confirm whether the
existing process is still active before resuming. A process can be alive without recent output.
Stopping the local runner does not cancel conversations already running in Dust.

## Prepare a new run

Use a new ignored directory, never the directory of an active or already-reviewed run. Keep each
model's two efforts adjacent in `candidates.json` so the eight-configuration design balances the
within-model contrasts. `reviewers.private.json` can contain `{"reviewers":["A","B","C","D","E","F","G","H"]}`.

```bash
node src/prepare-experiment.mjs \
  --source-dataset work/previous-eval/dataset.jsonl \
  --candidates work/new-eval/candidates.json \
  --reviewers work/new-eval/reviewers.private.json \
  --output-type answer \
  --out work/new-eval \
  --seed '<recorded-seed>'
node src/validate-dataset.mjs --dataset work/new-eval/dataset.jsonl
```

`--source-dataset` accepts the existing `qNN-a`/`qNN-b`, attachment-free format and reuses prompts,
not old candidates or outputs. Alternatively use **one** of `--questions <numbered-markdown>` or
`--questions-dir <directory-with-q01.md-through-q20.md>`. For other question counts or attachments,
prepare JSONL directly and agree on the sampling design separately.

Important defaults to override:

- Always supply `--candidates` and `--reviewers`; omission selects historical models/five-reviewer
  defaults, not the current eight-configuration design.
- Set `--output-type frame` for Frames; preparation otherwise defaults to text answers.
- Preparation writes `review: {"type":"ranking"}`. Add `"collection":"google-form"` to that
  object before building Slack payloads. Without it, posts ask for public thread rankings.
- The prepared manifest defaults to `evidenceMode: "live-tools"`; correct it to the chosen mode for
  self-contained Frame tasks. This is metadata, not an enforcement mechanism: prompts and tool
  access must implement the intended restriction.
- Do not rerun preparation in place after editing config or starting generation: it rewrites the
  dataset, config, manifest, and assignments.

Store secrets only in an ignored, permission-restricted credential file or a secret manager. Load a
trusted credential file without displaying its contents:

```bash
set -a
source '<path-to-private-credentials.env>'
set +a
export DUST_CLI_AUTH=0
export SLACK_CHANNEL_ID='<this-experiment-channel-id>'
```

Required variable names are `DUST_WORKSPACE_ID`, `DUST_ACCESS_TOKEN`, and `SLACK_BOT_TOKEN`.
`DUST_ADMIN_ACCESS_KEY` is used only for consumption export, never as the generation token.
Other channel variable names are bookkeeping: generic posting reads `SLACK_CHANNEL_ID` unless
`--channel-file` is supplied. Select the destination explicitly for each dataset.

## Pilot, publish, then scale

1. Validate the dataset and source permissions. Reusing one agent does not prove its external tools
   are authenticated. Check actual tool calls, including Notion/Drive/Slack or Snowflake when needed.
2. Generate one triplet with `run-eval.mjs --only-item q01-a --concurrency 1` plus the config, dataset,
   output directory, and event-log arguments in the runbook. This creates billable conversations.
3. Verify exact model/effort, terminal completion, source access, complete answers, and artifact
   anonymity. Inspect reliability failures rather than silently replacing them.
4. For Frames, run `resolve-frame-share-urls.mjs`, then `rebuild-output-index.mjs`. A `/files/fil_...`
   API URL is **not** a reviewer URL. Sharing resolution can send a followup agent message in the
   existing conversation; keep its cost separate from answer generation.
5. Build blind payloads with a recorded seed. Preview with `post-slack.mjs --dry-run --max 1`, then
   post one real triplet and verify the links/files as a reviewer before bulk posting.
6. Continue generation and publish only audited, complete triplets. Preserve slot mappings when
   publishing incrementally. Do not add reviewer lists, pings, or public voting prompts for Forms runs.

The private September `execute.mjs` automates generation, model audit, sharing links, incremental
publication, and final cost collection for its configured experiments. Use it only for that run,
after confirming no supervisor is already running. It is not a generic committed launcher.
For manual runs, model verification remains an operator step: `requireModelAudit: true` requires a
`prepublication-audit.private.json` next to the output index; it does not create the audit for you.

### Recovery rules

- **Poll timeout / interrupted runner:** reuse the saved conversation ID. Rerun the same generation
  command after confirming the old local runner stopped; completed outputs are skipped.
- **`creationUncertain`:** reconcile whether Dust created the conversation before any retry. Never
  use `--force` to bypass this safeguard.
- **Authentication failure or denied tool action:** fix access and mark the contaminated attempt
  invalid before an explicitly approved fresh conversation. A final answer does not make it valid.
- **Model failure / no usable output:** retain it as a reliability outcome. Apply the preregistered
  retry policy uniformly, preserving all attempts and costs.
- **Missing Frame sharing link:** inspect the existing sharing request first. Do not regenerate a
  good Frame solely because a helper request or local polling timed out.
- **Posting failure:** retain both posting-state files and resume. Do not delete state to “retry”.
  Removing or replacing already-posted Slack content requires a separate decision.

Record recovery reasons and affected IDs in the event log. Never silently omit a difficult model or
publish a two-answer thread as though it were the planned three-answer comparison.

## Collect private reviews

`review.collection = "google-form"` changes Slack copy and suppresses voting reactions. It does
**not** create a Form, insert its URL, or import responses. Current copy says “link to follow”.

Before inviting reviews, create and test the Form with a non-owner account. Include experiment ID,
triplet ID, reviewer ID, a complete anonymous ordering (for example `2 > 1 > 3`), per-output
usable/unusable flags, and optional comments. Keep response summaries and other reviewers' answers
private. Verify the assignment mapping and links without exposing model identities.

Archive the raw response export. Normalize responses to [examples/feedback.example.json](./examples/feedback.example.json)
before using the analysis scripts; a Google Forms importer is not implemented. Validate assignments,
slot permutations, missing reviews, and the agreed handling of edits/duplicates. Preserve unusable
flags separately; the ranking input does not automatically turn them into a reliability penalty.
`collect-feedback.mjs` reads Slack, so it is only for the older Slack-review workflow.

## Costs, analysis, and completion

Use actual Dust billed credits as the primary cost measure. Collect a conversation audit and, with
the separate admin key, run:

```bash
node src/collect-step-costs.mjs \
  --run '<run-dir>' --out '<data-dir>' \
  --api-key-name '<generation-key-name>' --log '<events-path>'
```

The name is not the secret key value.
The public export requires admin access **and** the `consumption_export_api` workspace feature flag.

Check reconciliation after analytics indexing catches up. Keep generation, sharing followups,
failed attempts, and nested-agent charges distinguishable. The export provides step-level credits
and tool timings, but zero LLM-step duration is not measured zero latency; use message-level timing.
Tool durations may overlap. Gross component credits need not sum to reconciled `totalCredits`.

Analyze complete rankings with Plackett–Luce and question-clustered uncertainty. Report quality,
unusable/no-output rates, billed credits, and latency separately before discussing tradeoffs. Choose
any same-thread similarity discount in advance; it is optional and defaults to zero in the analyzer.
Do not change the model set or weights afterward to obtain a preferred ordering.

Done means: every planned cell is accounted for; outputs and links are verified; required reviews
are collected or explicitly missing; costs reconcile or gaps are disclosed; raw data and reports are
archived privately; and the report states failures, retries, sample size, uncertainty, and limitations.
Generation completion is not review completion. A dataset on hold must remain unstarted until the
user authorizes it, even if its local inputs are already prepared.
