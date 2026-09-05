# King of the Frames

Human-judged, blind comparison of Frames generated from the same self-contained tasks. Research is
prepared once in a frame pack, each candidate receives identical inputs, and reviewers vote on the
rendered Frames without seeing which agent produced them.

This is separate from `x/henry/dust-evals`: there is no model judge and no automatic quality score.

## Quick start

1. Create a private working directory. Never put credentials or real evaluation data in this repo.

   ```bash
   cd x/henry/king-of-the-frames
   mkdir -p work/packs work/run work/review
   cp config.example.json work/config.json
   cp pricing.example.json work/pricing.json
   ```

2. Select professional, shareable source conversations and turn each into a self-contained pack.
   Follow [PACKS.md](./PACKS.md). Keep the original request in `brief.md`, move research outputs into
   attached files, and remove personal or workspace-specific material that reviewers should not see.

3. Validate the packs before spending model budget.

   ```bash
   node src/validate-packs.mjs --packs work/packs
   ```

4. Smoke-test one pack against every candidate. Supply a supported user OAuth token and workspace ID
   through the shell only.

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

5. Inspect the resulting conversations and Frames. If the smoke test is sound, run the full matrix.
   The runner is resumable, so running the same command again retries only unfinished cells.

   ```bash
   node src/run-eval.mjs \
     --config work/config.json \
     --packs work/packs \
     --out work/run
   ```

6. Resolve each generated file URL to a reviewer-accessible Frame share URL using the current,
   approved application or internal tooling. Save the normalized map as `work/frame-index.json`:

   ```json
   {
     "pack-id": {
       "agent-candidate-a": "https://example.invalid/share/frame/redacted-a",
       "agent-candidate-b": "https://example.invalid/share/frame/redacted-b"
     }
   }
   ```

7. Build randomized, blind review payloads and the private slot mapping.

   ```bash
   node src/build-blind-eval.mjs \
     --config work/config.json \
     --packs work/packs \
     --frame-index work/frame-index.json \
     --out work/review
   ```

8. Preview one matchup, then post the full set to a dedicated Slack channel. The bot token and channel
   ID remain in environment variables. Posting is resumable.

   ```bash
   export SLACK_CHANNEL_ID='<channel-id>'
   read -rs SLACK_BOT_TOKEN && export SLACK_BOT_TOKEN
   node src/post-slack.mjs --review work/review --dry-run --max 1
   node src/post-slack.mjs --review work/review --max 1
   # Inspect the real post, then:
   node src/post-slack.mjs --review work/review
   ```

9. At the end of the voting window, collect reactions and comments, tally the blind results, and
   compute cost and latency from a normalized usage export.

   ```bash
   export SLACK_BOT_USER_ID='<bot-user-id>'
   node src/collect-feedback.mjs --review work/review --out work/feedback.private.json
   node src/tally.mjs \
     --feedback work/feedback.private.json \
     --mapping work/review/mapping.private.json \
     --out work/tally
   node src/cost-latency.mjs \
     --usage work/usage.jsonl \
     --pricing work/pricing.json \
     --out work/cost-latency
   ```

10. Read [ANALYSIS.md](./ANALYSIS.md) before de-blinding qualitative findings. Combine voting,
    reliability, cost, latency, comments, screenshots, and code-grounded failure modes in the final
    report.

Read [RUNBOOK.md](./RUNBOOK.md) before a full run. It contains selection rules, data contracts,
retry behavior, cost accounting, Slack pitfalls, and the final quality checklist.
