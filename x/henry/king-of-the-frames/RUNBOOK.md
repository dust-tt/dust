# Generated-output evaluation runbook

Read [OPERATIONS.md](./OPERATIONS.md) first for the current prerequisites, private run layout, and
safe handoff. Commands here use generic `work/` paths; substitute the selected experiment's paths
consistently. Do not execute a second runner against an active run.

Use this runbook for a blind, human-judged comparison of candidate agents' generated outputs.
The method supports either fixed evidence or live research through the agent's tools. The latter
measures retrieval and evidence selection as part of model performance, in addition to reasoning,
implementation, reliability, cost, and latency.

Set `config.output.type` to `frame` or `answer`. Frame is the default. Frame runs wait for a generated
Frame file; answer runs wait for the completed agent message and save its text as Markdown.

Current runs use `review: {"type":"ranking", "collection":"google-form"}` for private responses.
Without `collection`, ranking mode asks for structured Slack replies such as `2 > 1 > 3`.
The compatibility default is `winner`, which uses the original slot reactions. Sections 11–13 retain
the legacy Slack collection workflow; use the private-review instructions in OPERATIONS for Forms.

## 1. Define the run

Write down the following before collecting data:

- The question being tested, for example whether a new skill improves output quality.
- Candidate agent IDs and private labels for each dataset item.
- Model IDs, reasoning levels, feature flags, and deployment versions.
- Evidence mode: fixed attachments or live agent tool calls.
- Target number and mix of dataset items.
- Workspace whose members and data are authorized for the run.
- Review channel, voting window, and intended reviewer group.
- Primary cost measure (actual Dust credits); dated pricing only if also estimating provider dollars.
- Exclusion rules, retry policy, and tie policy.

For evaluations that compare incomplete triplets of configurations, preregister the allocation and
reviewer design using [SAMPLING.md](./SAMPLING.md).

`prepare-experiment.mjs` implements 40 triplets with two disjoint triplets per question. For the current
design supply eight candidates and eight reviewers explicitly, plus a seed; do not inherit the
historical model/reviewer defaults. Assignments are private and do not imply Slack mentions or pings.

Change one experimental variable at a time when possible. If candidates differ in both model and skill
prompt, the result cannot isolate either factor.

Create `work/config.json` from `config.example.json` and one JSONL dataset. The config owns the output
and review types for the whole dataset; each JSONL row owns its candidates. Keep real candidate and
workspace identifiers in the ignored working directory.

## 2. Preflight access and privacy

Confirm:

- The generation API key can invoke the selected agent in the target workspace.
- Detailed export has a separate admin key and the workspace's `consumption_export_api` flag enabled.
- Every candidate agent is active and available to the operator.
- In live-tool mode, every configuration has the same Slack, Notion, and Drive tools, workspace
  visibility, and source permissions.
- The operator has approved read-only access for conversation discovery, transcript export, and usage
  export.
- Reviewers can open the intended Frame URLs, or the Slack bot can upload answer files.
- A Slack bot is installed in a dedicated channel.
- Real datasets, attachments, and results are stored only in the ignored working directory.

For Forms-mode publication, the bot needs `chat:write` and, for text answers, `files:write`.
History/channel inspection, private-channel access, channel creation, and the legacy reaction
workflow need their corresponding additional Slack scopes. Verify the actual operations in the
pilot rather than assuming a token is sufficient. Invite the bot to the channel and use its ID.

Read [SECURITY.md](./SECURITY.md). Do not continue if source conversations include unapproved personal,
customer, or private-space data.

## 3. Discover candidate source conversations

Skip discovery when reusing an already-approved dataset. Do not reselect or rewrite its questions
merely because the model list changed.

Use an approved read-only query or export to find recent conversations that generated the relevant
kind of output. Start with more candidates than the desired item count because filtering is
intentionally strict.

The discovery record should contain only what is needed to review eligibility:

- Conversation identifier and timestamp.
- Space visibility and professional/private classification.
- Request type: create, edit, or unrelated.
- Whether a reviewable output was produced.
- Whether source files and tool outputs remain retrievable.

Constrain the query by workspace, time range, output content type/use case, and ready state so it uses
existing indexes. Never perform a broad production scan. Store the query and raw output privately.

Apply the selection rules in [PACKS.md](./PACKS.md). Have a human approve the final list.

## 4. Build the dataset

For live-tool research, preserve the question and its research instructions in `prompt`. Do not export
Slack, Notion, or Drive evidence into attachments; each configuration must retrieve and select its own
evidence. Attach only files that are part of the original user request. Record any date cutoff and the
workspace/source scope that candidates are allowed to search.

For fixed-evidence evaluation, prepare a self-contained item:

1. Export the complete transcript and download source/tool-output files through approved read-only
   paths.
2. Use [templates/pack-builder-prompt.md](./templates/pack-builder-prompt.md) when research material
   must be converted into a self-contained task.
3. Put the final task in the row's `prompt`, and list supporting files in `attachments` using paths
   relative to the dataset file.
4. Put two to five candidate objects in the row's `candidates` array. Use `{ "agentId", "label" }`
   for distinct agents, or add a stable `id` and `modelSelection` when multiple configurations run
   through the same agent. Candidate sets can differ from item to item.
5. Review the item without opening the source conversation.
6. Scan for secrets, identifiers, private URLs, personal data, and irrelevant transcript noise.

In either mode, do not use a previous generated output as a style target. The complete row contract and
the distinction between evidence modes are documented in [README.md](./README.md).

Validate the complete set:

```bash
node src/validate-dataset.mjs --dataset work/dataset.jsonl
```

Fix all validation errors. The validator checks item IDs, prompts, candidate counts and IDs, duplicate
candidates, relative attachment paths, unique attachment basenames, regular files, and common credential
patterns. It is not a substitute for privacy review. The older `--packs` workflow remains available for
prebuilt pack directories and global `config.agents`.

## 5. Smoke-test generation

The runner uses the Dust v1 conversation and file-upload APIs. Current runs supply the generation API
key as `DUST_ACCESS_TOKEN` and set `DUST_CLI_AUTH=0`; CLI/OAuth support is a legacy fallback, not a
requirement. Keep the admin export key separate. Load secrets through the environment, not arguments.

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

Inspect every smoke-test candidate:

- The conversation received the same prompt and any original user attachments.
- In live-tool mode, the agent can call Slack, Notion, and Drive and can access the intended source
  scope; authentication, permission, or tool errors are visible in the conversation.
- In fixed-evidence mode, the candidate used the supplied evidence without doing additional research.
- The expected output type was produced.
- Returned `resolvedModel` exactly matches the requested provider, model, and reasoning effort.
- The Frame renders in the intended reviewer context, or the saved Markdown contains the complete
  answer.
- Attached data remains available where the output needs it.
- Candidate identity is not visible in the artifact or review copy.

The public API can evolve. Treat the smoke test as a compatibility check before every run.

## 6. Generate the full matrix

Run every item against only the candidates declared on that item:

```bash
node src/run-eval.mjs \
  --config work/config.json \
  --dataset work/dataset.jsonl \
  --out work/run \
  --log work/events.jsonl
```

The runner:

- Uploads any item attachments and attaches them to a new unlisted conversation.
- Mentions exactly one candidate in the message.
- In live-tool mode, lets the candidate independently use its configured tools; no evidence is injected
  by the runner.
- For `frame`, waits for terminal completion before accepting the generated Frame file.
- For `answer`, polls until the agent succeeds, then writes its final message to
  `work/run/answers/<item>/<agent>.md`.
- Writes one cell file under `work/run/cells/<item>/<agent>.json`.
- Appends an audit record to `work/run/results.jsonl`.
- Skips cells that already contain the required Frame URL or answer file.

Keep concurrency moderate. Start at four and increase only after watching rate limits and model latency.
High reasoning agents can be the long tail.

For live research, start all configurations assigned to the same question close together so mutable
workspace evidence does not create unnecessary time drift. Preserve every generated conversation ID;
the conversation is the audit trail for tool calls, selected sources, and tool failures.

A 401 requires fixing credentials before resuming the saved run. If explicitly using the older OAuth
workflow, token expiry and refresh-token rotation also apply; never run two rotating refresh-token
consumers concurrently. Do not switch generation to the admin export key as a workaround.

`status=created` is not automatically a failure. A Frame file can appear while the conversation is
still streaming. Both output types are accepted only after success or a graceful stop. A local timeout
does not cancel the remote conversation; fetch the saved ID before considering a fresh attempt.

## 7. Retry and completeness

Classify unfinished cells:

- Authentication or authorization failure: fix credentials, then rerun.
- Rate limit or transient platform failure: wait, then rerun.
- Poll timeout with server-side completion: recover the finished output through an approved lookup rather
  than generating a duplicate.
- Candidate finished without the expected output: follow the recorded retry allowance; a fresh
  conversation is a separate attempt, not an ordinary resume.
- Repeated candidate refusal or failure: record it as a no-output outcome.

Do not retry indefinitely. Retries change cost and can introduce selection bias. Keep the retry policy
identical across candidates and retain every attempt in the audit data.

Do not use `--force` for ordinary resumption. A cell with `creationUncertain` must be reconciled before
retrying, since an interrupted POST may already have created a billable conversation.

Before review, generate a completeness table with one row per item and declared candidate. A fair N-way
matchup requires a reviewable output from every candidate. The included blind-payload builder skips
incomplete items and writes `skipped.json`.

## 8. Build the output index

For Frame runs, `run-eval.mjs` captures authenticated file API URLs. Reviewers need accessible Frame
URLs with an appropriate scope. Use the resolver and rebuild the output index:

```bash
node src/resolve-frame-share-urls.mjs --run work/run --log work/events.jsonl
node src/rebuild-output-index.mjs \
  --config work/config.json --dataset work/dataset.jsonl --run work/run
```

Resolution reuses an existing share URL when possible; otherwise it requests one through a followup
agent message in the same conversation. This is billable and must be separated from generation cost.
The resulting `work/run/output-index.json` has this shape:

```json
{
  "item-id": {
    "agent-candidate-a": "https://host/share/frame/token-a",
    "agent-candidate-b": "https://host/share/frame/token-b"
  }
}
```

Do not commit this file. Share URLs can be sensitive even when they require a signed-in workspace user.
Prefer workspace-restricted sharing unless public access is an explicit requirement.

Open a sample of every candidate's links in the same browser state reviewers will use. Frames that work
inside their source conversation can still fail in a share context if they hardcode conversation-scoped
file paths.

For answer runs, the runner writes `work/run/output-index.json` automatically. Its values are paths to
the Markdown files relative to that index. Review the files for completeness and candidate-identifying
content before continuing; no URL-resolution step is needed.

## 9. Build the blind review set

```bash
node src/build-blind-eval.mjs \
  --config work/config.json \
  --dataset work/dataset.jsonl \
  --output-index work/run/output-index.json \
  --out work/review \
  --seed '<recorded-seed>' \
  --log work/events.jsonl
```

The same index path works for answers. The builder copies answers to randomized
slot files such as `work/review/files/<item>/answer-1.md`; candidate IDs do not appear in Slack
filenames.

Outputs:

- `payloads.json`: randomized Frame URLs or answer-file paths plus briefs. Candidate identities are
  absent.
- `mapping.private.json`: slot to candidate mapping. Keep private until blind analysis is complete.
- `blinding.private.json`: the seed and per-configuration slot-position counts.
- `skipped.json`: incomplete items and missing candidates.

The builder uses the recorded seed and balances every configuration across slot positions to within one
appearance. Keep the seed private until review closes.

## 10. Post to Slack

Always preview locally, post one real matchup, inspect it, then post the rest. Channel creation is a
separate explicit command and does not invite or ping reviewers.

```bash
export SLACK_CHANNEL_ID='<channel-id>'
read -rs SLACK_BOT_TOKEN && export SLACK_BOT_TOKEN
node src/post-slack.mjs --review work/review --dry-run --max 1
node src/post-slack.mjs --review work/review --max 1
# After human approval:
node src/post-slack.mjs --review work/review
```

Each matchup has:

- A root message with numbered Frame links, or numbered answer labels pointing to thread attachments.
- In Forms mode, a private-collection notice with no ranking instructions or voting reactions.
- In legacy Slack ranking mode, thread instructions for replying with every slot from best to worst, plus a
  `none suitable` reaction. Numbered vote reactions are not added.
- In winner mode, numbered vote reactions plus a `none suitable` reaction.
- The full brief in a thread reply.
- For answer runs, one blinded Markdown file per slot uploaded to the thread.

In winner mode, the tool adds numbered reactions sequentially with a default 1100 ms gap. Slack clients
order reactions using their first-add timestamps, whose coarse precision can reorder reactions added in
parallel or within the same second. Tallying uses reaction names, but stable display order prevents
reviewer mistakes. Legacy Slack ranking mode adds only `none suitable`; Forms mode adds neither.

Posting is resumable through `posted.private.json` and `posting-state.private.json`; preserve both.
Destructive cleanup helpers are not part of normal execution. Deleting channel content must be a
separate, explicit human decision.

## 11. Run the voting window (legacy Slack collection)

Tell reviewers:

- Open every output before ranking or voting.
- In ranking mode, reply with every slot exactly once, best to worst, for example `2 > 1 > 3`.
- Put qualitative feedback in a separate reply.
- Use `none suitable` instead of submitting a ranking if all candidates fail materially.
- In winner mode, vote for the best implementation, not the slot number usually preferred.
- Attach screenshots for rendering or interaction problems.

Keep the candidate mapping closed. Do not publish interim candidate standings because they can influence
later voters. Track participation and extend the window if too many matchups have no votes.

## 12. Collect feedback (legacy Slack collection)

```bash
export SLACK_BOT_USER_ID='<bot-user-id>' # optional; auth.test is used otherwise
node src/collect-feedback.mjs \
  --review work/review \
  --assignments work/reviewer-assignments.private.json \
  --out work/feedback.private.json
```

The collector excludes the bot's seeded reactions and captures slot votes, none votes, reviewer IDs,
thread comments, and file metadata. In ranking mode it also validates complete permutations, keeps the
latest structured reply from each reviewer, and reports invalid replies. When assignments are supplied,
it excludes unassigned rankings and reports missing assigned reviews. A reviewer cannot both submit a
ranking and select `none suitable`. Resolve all reported errors before freezing feedback.

The collector does not download screenshots. If screenshots are required for qualitative analysis,
download them with `files:read` and a bearer token, then verify file magic bytes. A redirect or HTML
login page saved as `.png` is not a valid screenshot.

Do not assign comments to candidates programmatically. Reviewers write free-form references such as
"2 is blank" and can discuss several slots in one comment. Preserve raw context for the blind review.

## 13. Tally votes

```bash
node src/tally.mjs \
  --feedback work/feedback.private.json \
  --mapping work/review/mapping.private.json \
  --out work/tally
```

For structured reviews, the output includes ranking count, first-place count, average rank, and
pairwise wins derived from every ordering. It also retains the original match-level winner metrics so
older reaction-based feedback remains readable. Read [ANALYSIS.md](./ANALYSIS.md) for definitions.

Freeze the feedback and tally at the announced close time. Record late votes separately rather than
silently changing the published denominator.

## 14. Export usage and compute cost/latency

### Primary measure: actual Dust credits

```bash
node src/collect-run-audit.mjs \
  --config work/config.json --run work/run \
  --out work/run-audit.private.json --log work/events.jsonl
node src/collect-step-costs.mjs \
  --run work/run --out work/data \
  --api-key-name '<generation-api-key-name>' --log work/events.jsonl
```

The first command reads conversations with the generation credentials. The second uses
`DUST_ADMIN_ACCESS_KEY` for the public consumption export; admin permission and the workspace's
`consumption_export_api` feature flag are both required. `--api-key-name` is the generation key's
display name, not its secret value. No database access is required for these metrics.

Outputs are `consumption-rows.private.jsonl` (per billed unit) and `step-costs.private.json` (message
and step summaries). Check reconciliation against message credits; active or recently completed
messages can be missing until indexing catches up. Refresh before final analysis. Keep failed-attempt
spend, generation spend, and sharing-helper spend separate. Never assume zero exported LLM execution
time means zero latency, or that overlapping tool durations sum to wall-clock time.

To refresh automatically as part of `collect-run-audit`, add this optional block to the run config:

```json
{
  "detailedConsumption": {
    "apiKeyName": "<generation-api-key-name>",
    "credentialFile": "credentials.env",
    "outputDirectory": "data"
  }
}
```

Both paths are relative to the config file. The credential-file fallback reads only the admin key;
normal generation credentials must still be in the environment. See [ANALYSIS.md](./ANALYSIS.md)
for the distinction between conversation totals and generation-only comparisons.

### Optional measure: provider-dollar estimates

Use a production read replica or approved analytics export. Start from the generated conversation IDs in
`work/run/results.jsonl`, then join narrowly to messages, agent messages, run IDs, runs, and run usage.
Export only the fields in the normalized contract documented in [ANALYSIS.md](./ANALYSIS.md).

Before calculating:

1. Confirm whether provider prompt tokens include cache-read and cache-write tokens.
2. Normalize into disjoint fresh-input, cache-read, cache-write, and output counters.
3. Confirm the exact model ID used by each candidate.
4. Record per-million-token prices and their effective date in `work/pricing.json`.
5. Reproduce the recorded cost of at least one production-priced control conversation.
6. Mark only reviewed, output-producing conversations with `outputProduced: true`.
7. For live-tool runs, retain tool-related consumption and latency where available and report it
   separately from model-token cost.

Run `collect-run-audit.mjs` first. It verifies the resolved model selection and captures conversation
timings, tool-call metadata, citations, and billed-credit attribution without duplicating raw tool
outputs. The normalized token export remains the source for provider-dollar cost.

Then run:

```bash
node src/cost-latency.mjs \
  --usage work/usage.jsonl \
  --pricing work/pricing.json \
  --out work/cost-latency
```

Do not add cache counters to an inclusive prompt-token total. That error can multiply input cost.
Experimental models may have placeholder recorded costs; the verified price table is authoritative for
those models.

## 15. Perform blind qualitative analysis

Follow [ANALYSIS.md](./ANALYSIS.md) and
[templates/matchup-analysis-prompt.md](./templates/matchup-analysis-prompt.md).

Keep analysis slot-blind. Where applicable, read code, exercise interactions, inspect responsive
behavior, and ground every claim in the brief, reviewer evidence, screenshots, or a specific source
pattern. Analyze every output, not only winners. Reliability failures are often underrepresented in raw
votes when reviewers abandon a broken output without reacting.

After all slot documents are frozen, join them to candidates with `mapping.private.json` and build a
per-candidate synthesis.

Use `analyze-rankings.mjs` for the complete-ranking model, question-clustered bootstrap intervals,
reviewer agreement, and audit summaries. Its named effort-pair report still contains historical IDs;
validate/update that analysis before using it for a new model list. It does not
replace the blind qualitative pass or the separately normalized provider-dollar calculation.

## 16. Publish and archive

The final report must state:

- Candidate configuration and evaluation dates.
- Dataset item count, selection filters, and skipped/incomplete counts.
- Reviewer count, total votes, decided matchups, and no-vote matchups.
- Retry policy and operational incidents.
- Evidence mode and, for live research, tool/source permissions, retrieval failures, and temporal drift.
- Voting, reliability, cost, latency, and qualitative results.
- Pricing assumptions and token-normalization method.
- Limitations and known confounders.

Archive the private working directory in an approved restricted location. Keep the committed toolkit
generic. Never commit a real run to this package.

## Final checklist

- [ ] Candidate matrix and experimental variable are documented.
- [ ] Dataset items passed privacy review and `validate-dataset`.
- [ ] Every declared candidate passed a one-item smoke test.
- [ ] Full run is complete or missing cells are explicitly recorded.
- [ ] Share links work in reviewer context.
- [ ] Blind payloads contain no candidate identity.
- [ ] Private mapping is access-restricted.
- [ ] One Slack post was approved before bulk posting.
- [ ] Private Form access/response privacy and import are verified, or legacy Slack collection is explicit.
- [ ] Required assigned reviews are present or missingness is documented.
- [ ] For legacy votes, bot reactions are excluded and denominators use decided matchups.
- [ ] Dust credits reconcile; generation, retries, and sharing followups are distinguishable.
- [ ] If reporting provider dollars, usage counters are disjoint and pricing is dated and verified.
- [ ] Blind qualitative documents were frozen before de-blinding.
- [ ] Final claims have matchup and source evidence.
- [ ] Real data and credentials remain outside git.
