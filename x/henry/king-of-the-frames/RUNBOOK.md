# Frame evaluation runbook

Use this runbook for a blind, human-judged comparison of candidate agents' ability to build Frames.
The method controls research inputs so the comparison measures design, implementation, reliability,
cost, and latency rather than differences in browsing or data retrieval.

## 1. Define the run

Write down the following before collecting data:

- The question being tested, for example whether a new Frame skill improves quality.
- Candidate agent IDs and neutral display labels.
- Model IDs, reasoning levels, feature flags, and deployment versions.
- Target number and mix of packs.
- Workspace whose members and data are authorized for the run.
- Review channel, voting window, and intended reviewer group.
- Pricing source and effective date.
- Exclusion rules, retry policy, and tie policy.

Change one experimental variable at a time when possible. If candidates differ in both model and skill
prompt, the result cannot isolate either factor.

Create `work/config.json` from `config.example.json`. Keep real candidate and workspace identifiers in
the ignored working directory.

## 2. Preflight access and privacy

Confirm:

- The operator can use a supported user OAuth session in the target workspace.
- Every candidate agent is active and available to the operator.
- The operator has approved read-only access for conversation discovery, transcript export, and usage
  export.
- Reviewers can open the intended Frame share scope.
- A Slack bot is installed in a dedicated channel.
- Real packs and results are stored only in the ignored working directory.

Recommended Slack scopes are `chat:write`, `channels:read`, `channels:history`, `reactions:read`,
`reactions:write`, and `files:read` if screenshots will be downloaded. Invite the bot to the channel.
Use channel IDs, not names, in scripts.

Read [SECURITY.md](./SECURITY.md). Do not continue if source conversations include unapproved personal,
customer, or private-space data.

## 3. Discover candidate source conversations

Use an approved read-only query or export to find recent conversations that generated a Frame. Start
with more candidates than the desired pack count because filtering is intentionally strict.

The discovery record should contain only what is needed to review eligibility:

- Conversation identifier and timestamp.
- Space visibility and professional/private classification.
- Request type: create, edit, or unrelated.
- Whether a Frame was produced.
- Whether source files and tool outputs remain retrievable.

Constrain the query by workspace, time range, Frame content type/use case, and ready state so it uses
existing indexes. Never perform a broad production scan. Store the query and raw output privately.

Apply the selection rules in [PACKS.md](./PACKS.md). Have a human approve the final list.

## 4. Build self-contained packs

For every selected conversation:

1. Export the complete transcript and download source/tool-output files through approved read-only
   paths.
2. Run one pack-builder task using [templates/pack-builder-prompt.md](./templates/pack-builder-prompt.md).
3. Put user intent in `brief.md`, research evidence in `context`, and original user files in
   `attachments`.
4. Document every attached file in `context/INDEX.md` and `manifest.json`.
5. Review the pack without opening the source conversation.
6. Scan for secrets, identifiers, private URLs, personal data, and irrelevant transcript noise.

Do not use the previous generated Frame as a style target. It is useful only to check that the pack has
enough information to satisfy the original request.

Validate the complete set:

```bash
node src/validate-packs.mjs --packs work/packs
```

Fix all validation errors. The validator checks required files, unique attachment basenames, manifest
coverage, the no-research instruction, symlinks, and common credential patterns. It is not a substitute
for privacy review.

## 5. Smoke-test generation

The runner uses the Dust v1 conversation and file-upload APIs with a user OAuth bearer. It intentionally
does not implement a login flow or persist credentials. Obtain a token through the currently supported
auth path and export it only in the shell.

```bash
export DUST_WORKSPACE_ID='<workspace-sId>'
read -rs DUST_ACCESS_TOKEN && export DUST_ACCESS_TOKEN
node src/run-eval.mjs \
  --config work/config.json \
  --packs work/packs \
  --out work/run \
  --only-pack '<pack-id>' \
  --concurrency 1
```

Inspect every smoke-test candidate:

- The conversation received the same brief and attachment basenames.
- The candidate did not redo research.
- A Frame file was generated.
- The Frame renders in the intended reviewer context.
- Attached data loads in a shared Frame.
- Candidate identity is not visible in the artifact or review copy.

The public API can evolve. Treat the smoke test as a compatibility check before every run.

## 6. Generate the full matrix

Run every pack against every candidate:

```bash
node src/run-eval.mjs \
  --config work/config.json \
  --packs work/packs \
  --out work/run
```

The runner:

- Uploads each pack file and attaches it to a new unlisted conversation.
- Mentions exactly one candidate in the message.
- Polls until it sees a generated file with the Frame content type, hits a terminal error, or times out.
- Writes one cell file under `work/run/cells/<pack>/<agent>.json`.
- Appends an audit record to `work/run/results.jsonl`.
- Skips cells that already contain a non-empty Frame file URL.

Keep concurrency moderate. Start at four and increase only after watching rate limits and model latency.
High reasoning agents can be the long tail.

An OAuth access token may expire during a long run. The runner stops retrying a 401 and tells the
operator to refresh the token. Export the new token and run the same command again. Completed cells are
preserved. Never run two refresh-token consumers concurrently when the identity provider rotates refresh
tokens.

`status=created` is not automatically a failure. The Frame file can appear while the conversation is
still streaming. The file artifact is the completion criterion.

## 7. Retry and completeness

Classify unfinished cells:

- Authentication or authorization failure: fix credentials, then rerun.
- Rate limit or transient platform failure: wait, then rerun.
- Poll timeout with server-side completion: recover the finished Frame through an approved lookup rather
  than generating a duplicate.
- Candidate finished without a Frame: retry once.
- Repeated candidate refusal or failure: record it as a no-Frame outcome.

Do not retry indefinitely. Retries change cost and can introduce selection bias. Keep the retry policy
identical across candidates and retain every attempt in the audit data.

Before review, generate a completeness table with one row per pack and candidate. A fair N-way matchup
requires a reviewable Frame from every candidate. The included blind-payload builder skips incomplete
packs and writes `skipped.json`.

## 8. Resolve reviewer links

`run-eval.mjs` captures authenticated file API URLs. Reviewers need Frame share URLs with an appropriate
scope. Resolve each file through the current approved application or internal read-only tooling and
write `work/frame-index.json`:

```json
{
  "pack-id": {
    "agent-candidate-a": "https://host/share/frame/token-a",
    "agent-candidate-b": "https://host/share/frame/token-b"
  }
}
```

Do not commit this file. Share URLs can be sensitive even when they require a signed-in workspace user.
Prefer workspace-restricted sharing unless public access is an explicit requirement.

Open a sample of every candidate's links in the same browser state reviewers will use. A Frame that works
inside its source conversation can still fail in a share context if it hardcodes conversation-scoped
file paths.

## 9. Build the blind review set

```bash
node src/build-blind-eval.mjs \
  --config work/config.json \
  --packs work/packs \
  --frame-index work/frame-index.json \
  --out work/review
```

Outputs:

- `payloads.json`: randomized slot URLs and briefs. Candidate identities are absent.
- `mapping.private.json`: slot to candidate mapping. Keep private until blind analysis is complete.
- `skipped.json`: incomplete packs and missing candidates.

The builder uses a cryptographic Fisher-Yates shuffle for every matchup. Do not reuse a fixed slot order.

## 10. Post to Slack

Always preview locally, post one real matchup, inspect it, then post the rest.

```bash
export SLACK_CHANNEL_ID='<channel-id>'
read -rs SLACK_BOT_TOKEN && export SLACK_BOT_TOKEN
node src/post-slack.mjs --review work/review --dry-run --max 1
node src/post-slack.mjs --review work/review --max 1
# After human approval:
node src/post-slack.mjs --review work/review
```

Each matchup has:

- A root message with numbered Frame links.
- Numbered vote reactions plus a `none suitable` reaction.
- The full brief in a thread reply.

The tool adds reactions sequentially with a default 1100 ms gap. Slack clients order reactions using
their first-add timestamps, whose coarse precision can reorder reactions added in parallel or within the
same second. Tallying uses reaction names, but stable display order prevents reviewer mistakes.

Posting is resumable through `posted.private.json`. There is intentionally no automated cleanup command.
Deleting channel content must be a separate, explicit human decision.

## 11. Run the voting window

Tell reviewers:

- Open every Frame before voting.
- Vote for the best implementation, not the slot number they usually prefer.
- Use `none suitable` if all candidates fail materially.
- Add comments for concrete strengths or failures.
- Attach screenshots for rendering or interaction problems.

Keep the candidate mapping closed. Do not publish interim candidate standings because they can influence
later voters. Track participation and extend the window if too many matchups have no votes.

## 12. Collect feedback

```bash
export SLACK_BOT_USER_ID='<bot-user-id>' # optional; auth.test is used otherwise
node src/collect-feedback.mjs \
  --review work/review \
  --out work/feedback.private.json
```

The collector excludes the bot's seeded reactions and captures slot votes, none votes, reviewer IDs,
thread comments, and file metadata. It does not download screenshots. If screenshots are required for
qualitative analysis, download them with `files:read` and a bearer token, then verify file magic bytes.
A redirect or HTML login page saved as `.png` is not a valid screenshot.

Do not assign comments to candidates programmatically. Reviewers write free-form references such as
"2 is blank" and can discuss several slots in one comment. Preserve raw context for the blind review.

## 13. Tally votes

```bash
node src/tally.mjs \
  --feedback work/feedback.private.json \
  --mapping work/review/mapping.private.json \
  --out work/tally
```

The output includes matches played, decided matchups, outright wins, tie share, raw votes, win rate,
none votes, no-vote matchups, and unique reviewers. Read [ANALYSIS.md](./ANALYSIS.md) for definitions.

Freeze the feedback and tally at the announced close time. Record late votes separately rather than
silently changing the published denominator.

## 14. Export usage and compute cost/latency

Use a production read replica or approved analytics export. Start from the generated conversation IDs in
`work/run/results.jsonl`, then join narrowly to messages, agent messages, run IDs, runs, and run usage.
Export only the fields in the normalized contract documented in [ANALYSIS.md](./ANALYSIS.md).

Before calculating:

1. Confirm whether provider prompt tokens include cache-read and cache-write tokens.
2. Normalize into disjoint fresh-input, cache-read, cache-write, and output counters.
3. Confirm the exact model ID used by each candidate.
4. Record per-million-token prices and their effective date in `work/pricing.json`.
5. Reproduce the recorded cost of at least one production-priced control conversation.
6. Mark only reviewed, Frame-producing conversations with `frameProduced: true`.

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

Keep analysis slot-blind. Read code, exercise interactions, inspect responsive behavior, and ground every
claim in the brief, reviewer evidence, screenshots, or a specific source pattern. Analyze every Frame,
not only winners. Reliability failures are often underrepresented in raw votes when reviewers abandon a
broken page without reacting.

After all slot documents are frozen, join them to candidates with `mapping.private.json` and build a
per-candidate synthesis.

## 16. Publish and archive

The final report must state:

- Candidate configuration and evaluation dates.
- Pack count, selection filters, and skipped/incomplete counts.
- Reviewer count, total votes, decided matchups, and no-vote matchups.
- Retry policy and operational incidents.
- Voting, reliability, cost, latency, and qualitative results.
- Pricing assumptions and token-normalization method.
- Limitations and known confounders.

Archive the private working directory in an approved restricted location. Keep the committed toolkit
generic. Never commit a real run to this package.

## Final checklist

- [ ] Candidate matrix and experimental variable are documented.
- [ ] Packs passed privacy review and `validate-packs`.
- [ ] Every candidate passed a one-pack smoke test.
- [ ] Full run is complete or missing cells are explicitly recorded.
- [ ] Share links work in reviewer context.
- [ ] Blind payloads contain no candidate identity.
- [ ] Private mapping is access-restricted.
- [ ] One Slack post was approved before bulk posting.
- [ ] Seed reactions appear in stable numeric order.
- [ ] Bot votes are excluded.
- [ ] Vote denominator is decided matchups, not all posted matchups.
- [ ] Usage counters are disjoint and pricing is dated and verified.
- [ ] Blind qualitative documents were frozen before de-blinding.
- [ ] Final claims have matchup and source evidence.
- [ ] Real data and credentials remain outside git.
