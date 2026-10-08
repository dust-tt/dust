# King of the Frames

Human-judged, blind comparison of generated outputs from the same tasks. Each item's declared
candidates receive the same prompt and reviewers assess the outputs without seeing which configuration
produced them. Evidence can either be fixed in attachments or gathered independently through the
agent's tools. An output can be a generated Frame or the agent's final text answer.

This is separate from `x/henry/dust-evals`: there is no model judge and no automatic quality score.

**Start with [OPERATIONS.md](./OPERATIONS.md)** for what to provide, the current eight-configuration /
eight-reviewer workflow, credential setup, private Google Forms, logs, and safe recovery. The commands
below also cover historical/manual workflows; do not rely on their compatibility defaults for a new
run. Real run state and credentials live under ignored `work/` directories, not in a fresh clone.

## Dataset format

The primary input is JSONL with one object per evaluation item:

```json
{
  "id": "case-001",
  "prompt": "Write the launch analysis...",
  "candidates": [
    {
      "id": "fable-low",
      "agentId": "dust",
      "label": "Fable / low",
      "modelSelection": {
        "providerId": "anthropic",
        "modelId": "claude-fable-5",
        "reasoningEffort": "light"
      }
    },
    {
      "id": "fable-high",
      "agentId": "dust",
      "label": "Fable / high",
      "modelSelection": {
        "providerId": "anthropic",
        "modelId": "claude-fable-5",
        "reasoningEffort": "high"
      }
    }
  ],
  "attachments": ["files/case-001/data.csv"]
}
```

Each item declares two to five candidates. `id` is the stable identity used by the eval, while
`agentId` is the Dust agent invoked to execute it. `modelSelection` optionally overrides that agent's
model for the message. The example uses historical effort values; verify each selected model's current
Dust values (`medium`, `high`, `xhigh`, `maximal`, etc.) rather than translating labels by assumption.
Multiple candidates may therefore share `agentId: "dust"` as long as they have distinct IDs.
For compatibility, omitting `id` makes it default to `agentId`, and omitting
`modelSelection` preserves the original agent-ID-only behavior.

Candidate IDs and labels stay private; Slack exposes only randomized slots. Attachment paths are
relative to the dataset file and their basenames must be unique within the item. A reused candidate ID
must keep the same label, execution agent, and model selection across items. See
[examples/dataset.example.jsonl](./examples/dataset.example.jsonl).

## Evidence modes

Choose one evidence mode for an experiment and record it before the run:

- **Live tool research:** send the question without pre-exported Slack, Notion, or Drive evidence and
  let every configuration use the same `dust` agent and workspace tool permissions. This evaluates
  retrieval, tool use, evidence selection, reasoning, and synthesis together. Keep `attachments` empty
  unless the original task itself includes a user-provided file.
- **Fixed evidence:** attach the same frozen evidence to every candidate and prohibit additional
  research. This isolates reasoning and output quality from retrieval. [PACKS.md](./PACKS.md) documents
  this workflow.

Do not mix the modes within one analysis. For live research, candidates receive the same opportunity
to retrieve evidence, not necessarily the same retrieved facts. Start the candidates for a question
close together and retain their conversation IDs so tool traces, source selection, failures, cost, and
latency can be audited later.

## Output types

Set `config.output.type` to `frame` or `answer`. If `output` is omitted, the original Frame behavior is
used.

```json
{
  "output": {
    "type": "answer"
  }
}
```

Use one config file per dataset. For `frame`, the runner records the generated Frame URL. For `answer`,
it waits for the completed agent message, writes the exact answer to
`work/run/answers/<item>/<agent>.md`, and creates
`work/run/output-index.json` for the blind-review builder.

## Review types

For current runs, use `"review": {"type":"ranking", "collection":"google-form"}`. Slack distributes
anonymous outputs; rankings are collected privately. This setting suppresses Slack voting but does
not create the Form or import its responses. See [review setup](./OPERATIONS.md#collect-private-reviews).

For the older Slack workflow, set `config.review.type` to `ranking` without `collection` to ask for a
thread reply such as `2 > 1 > 3`. Each slot must appear exactly once. The collector keeps the latest structured
reply, reports invalid permutations, and rejects reviewers who both rank the outputs and react
`none suitable`.

If `review` is omitted, the compatibility default is `winner`: reviewers vote for one slot with a
reaction. The committed example config opts into `ranking`.

## Quick start

For a new 20-question experiment, generate the 40-triplet dataset and private manifest with explicit
candidates and reviewers. The committed defaults are historical, not the current model list:

```bash
node src/prepare-experiment.mjs \
  --questions work/new-eval/questions.md \
  --candidates work/new-eval/candidates.json \
  --reviewers work/new-eval/reviewers.private.json \
  --output-type answer \
  --out work/new-eval \
  --seed '<recorded-seed>'
```

This writes the dataset, config, manifest, event log, and reviewer assignments. Set
`review.collection` to `google-form` afterward. For the current design, provide eight candidates and
eight reviewers. Pricing snapshots are only emitted for the historical default candidates; current
runs measure actual Dust credits. Do not run preparation again over an active run.

The remaining steps illustrate a manual run using `work/config.json` and `work/dataset.jsonl`.
For a prepared experiment, substitute its own paths throughout; do not create a second output tree.

1. Create an ignored private working directory. Never commit credentials or real evaluation data.

   ```bash
   cd x/henry/king-of-the-frames
   mkdir -p work/run work/review
   cp config.example.json work/config.json
   cp examples/dataset.example.jsonl work/dataset.jsonl
   cp pricing.example.json work/pricing.json
   ```

2. Replace `work/dataset.jsonl` with the real items and per-item candidate lists. For a live-tool
   experiment, keep the Slack, Notion, and Drive evidence out of `attachments`; the agent retrieves it
   during the run. For fixed evidence, keep attachment paths relative to the dataset and follow
   [PACKS.md](./PACKS.md).

   Set the dataset's output type and `review.collection: "google-form"` explicitly in the copied
   config for current runs; the example config still defaults to Frame outputs and Slack rankings.

3. Validate the dataset before spending model budget.

   ```bash
   node src/validate-dataset.mjs --dataset work/dataset.jsonl
   ```

4. Smoke-test one item against its declared candidates. Supply the public API key and workspace ID
   through the environment; `DUST_ACCESS_TOKEN` is the runner's variable name for the API key.

   ```bash
   export DUST_WORKSPACE_ID='<workspace-sId>'
   read -rs DUST_ACCESS_TOKEN && export DUST_ACCESS_TOKEN
   export DUST_CLI_AUTH=0
   node src/run-eval.mjs \
     --config work/config.json \
     --dataset work/dataset.jsonl \
     --out work/run \
     --only-item '<item-id>' \
     --concurrency 1 \
     --log work/events.jsonl
   ```

5. Inspect the resulting conversations and outputs. If the smoke test is sound, run the full matrix.
   After the prior process stops, the same command resumes saved conversations and skips completed
   outputs. It does not automatically create a fresh attempt for a terminal model failure.

   ```bash
   node src/run-eval.mjs \
     --config work/config.json \
     --dataset work/dataset.jsonl \
     --out work/run \
     --log work/events.jsonl
   ```

6. For a Frame run, resolve generated files to sharing URLs, then rebuild the index:

   ```bash
   node src/resolve-frame-share-urls.mjs --run work/run --log work/events.jsonl
   node src/rebuild-output-index.mjs \
     --config work/config.json --dataset work/dataset.jsonl --run work/run
   ```

   This can send a billable sharing followup in the existing conversation. Check reviewer access.
   For answers, `work/run/output-index.json` is generated automatically.

7. Build randomized, blind review payloads and the private slot mapping. Both workflows above use
   `work/run/output-index.json`. Audit returned model/effort and terminal status before publishing.

   ```bash
   node src/build-blind-eval.mjs \
     --config work/config.json \
     --dataset work/dataset.jsonl \
     --output-index work/run/output-index.json \
     --out work/review \
     --seed '<recorded-seed>' \
     --log work/events.jsonl
   ```

8. Preview one matchup, then post the full set to a dedicated Slack channel. Frame runs put numbered
   links in the root message. Answer runs upload blinded Markdown files to its thread. Forms-mode
   reviews are private; only the legacy ranking mode asks for thread replies. Posting is resumable.
   A channel can be created explicitly without inviting or pinging reviewers:

   ```bash
   read -rs SLACK_BOT_TOKEN && export SLACK_BOT_TOKEN
   node src/create-slack-channel.mjs \
     --name '<channel-name>' \
     --private \
     --out work/slack-channel.private.json \
     --dry-run
   # After approving the request, run the same command without --dry-run:
   node src/create-slack-channel.mjs \
     --name '<channel-name>' \
     --private \
     --out work/slack-channel.private.json \
     --log work/events.jsonl
   node src/post-slack.mjs \
     --review work/review \
     --channel-file work/slack-channel.private.json \
     --dry-run \
     --max 1
   node src/post-slack.mjs --review work/review --channel-file work/slack-channel.private.json --max 1
   # Inspect the real post, then:
   node src/post-slack.mjs --review work/review --channel-file work/slack-channel.private.json
   ```

9. At the end of the review window, export and normalize private Form responses as described in
   [OPERATIONS.md](./OPERATIONS.md#collect-private-reviews). `collect-feedback.mjs` below is **only for
   Slack reviews**; skip it for Forms. Resolve invalid/missing reviews before freezing feedback.
   `collect-run-audit.mjs` provides API credits and timing. The token-pricing calculator below is
   optional provider-dollar analysis, not the primary Dust-credit cost measure.

   ```bash
   node src/collect-feedback.mjs \
     --review work/review \
     --assignments work/reviewer-assignments.private.json \
     --out work/feedback.private.json \
     --log work/events.jsonl
   node src/collect-run-audit.mjs \
     --config work/config.json \
     --run work/run \
     --out work/run-audit.private.json \
     --log work/events.jsonl
   node src/tally.mjs \
     --feedback work/feedback.private.json \
     --mapping work/review/mapping.private.json \
     --out work/tally
   node src/cost-latency.mjs \
     --usage work/usage.jsonl \
     --pricing work/pricing.json \
     --out work/cost-latency
   node src/analyze-rankings.mjs \
     --feedback work/feedback.private.json \
     --mapping work/review/mapping.private.json \
     --manifest work/manifest.private.json \
     --audit work/run-audit.private.json \
     --out work/analysis
   ```

10. Read [ANALYSIS.md](./ANALYSIS.md) before de-blinding qualitative findings. Combine voting,
    reliability, cost, latency, comments, screenshots, and code-grounded failure modes in the final
    report.

Read [RUNBOOK.md](./RUNBOOK.md) before a full run. It contains selection rules, data contracts,
retry behavior, cost accounting, Slack pitfalls, and the final quality checklist.
