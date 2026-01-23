# Dust Agent Evaluation System

## Overview

This evaluation system tests Dust agents by running prompts from CSV files and using a judge agent with majority voting to score responses.

## Key Features

- **Majority Voting**: Multiple judge runs per evaluation (default 3) for reliable scoring
- **Configurable Scales**: binary, 0-3, 1-5, or 0-100
- **Conversation ID Tracking**: Full traceability for debugging
- **Smart Retries**: Exponential backoff with error classification
- **Checkpointing**: Resume interrupted evaluations
- **Dry Run**: Validate configuration before executing

## Prerequisites

### Runtime
This project uses **Bun** exclusively. Do not use npm, node, or yarn.

```bash
curl -fsSL https://bun.sh/install | bash
bun --version
```

### Environment Variables
```bash
export DUST_API_KEY="sk-..."
export DUST_WORKSPACE_ID="..."
```

## Quick Commands

```bash
# Install & build
bun install
bun run build

# Run evaluation
bun run eval --agents "agent1,agent2" --csv "./prompts.csv" --judge "judge-id"

# Dry run (validate only)
bun run eval --agents "agent1" --csv "./prompts.csv" --judge "judge-id" --dry-run

# Run tests
bun test

# Type check
bun run typecheck
```

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--agents` | required | Comma-separated agent sIds |
| `--csv` | required | Path to prompts CSV |
| `--judge` | required | Judge agent sId |
| `--runs` | 1 | Runs per prompt per agent |
| `--judge-runs` | 3 | Judge evaluations per response |
| `--parallel` | 5 | Concurrent executions |
| `--timeout` | 2m | Timeout (supports: 30s, 2m, 120000) |
| `--scale` | 0-3 | Scale: binary, 0-3, 1-5, 0-100 |
| `--output` | console | Format: json, csv, console |
| `--output-file` | - | Save results to file |
| `--max-retries` | 3 | Max retry attempts |
| `--retry-backoff` | 1s | Base backoff duration |
| `--sample` | - | Sample N prompts randomly |
| `--seed` | - | Random seed for reproducibility |
| `--prompt-filter` | - | Filter: 1,3,5 or 1-5 or *pattern* |
| `--min-agreement` | - | Flag low agreement (0-1) |
| `--resume` | false | Resume from checkpoint |
| `--verbose` | false | Enable verbose logging |
| `--dry-run` | false | Validate without executing |
| `--config` | - | Path to JSON config file |

## CSV Format

```csv
prompt,judge_prompt
"What is 2+2?","The correct answer is 4."
"Explain photosynthesis","Should mention plants, sunlight, CO2, oxygen."
```

## Project Structure

```
src/
├── cli.ts           # CLI entry point
├── types.ts         # Types and scales
├── dust-client.ts   # Dust API wrapper with retries
├── evaluator.ts     # Main evaluation logic
├── grading.ts       # Score extraction & majority voting
├── reporter.ts      # Output formatting
├── csv-loader.ts    # CSV parsing with filtering
├── checkpoint.ts    # Resume functionality
├── grading.test.ts  # Grading tests
└── csv-loader.test.ts # CSV tests
```

## Key Implementation Details

### Majority Voting (grading.ts)
- Discrete scales: Uses mode (most common score)
- 0-100 scale: Uses median
- Reports agreement (0-1) and variance

### Retry Logic (dust-client.ts)
- Retries: Timeouts, 429, 5xx, network errors
- No retry: 4xx client errors (400, 401, 403, 404)
- Backoff: Exponential with 30% jitter

### Error Classification
```typescript
function isRetryableError(error: Error): boolean
```

### Parallelism (evaluator.ts)
Tasks are batched and executed in parallel at batch boundaries (not all at once).

### Type Pattern
Uses `Result<T, E>` pattern with `Ok()` and `Err()` helpers.

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/grading.test.ts
```

Test coverage:
- Score extraction (all scales, edge cases)
- Majority voting calculation
- CSV loading and filtering
- Seeded sampling

## Error Handling

- Functions return `Result<T, E>`
- Use `.isOk` and `.isErr()` for checking
- Early returns on errors
- No try-catch except for external library calls

## Output Fields

JSON output includes:
- `results[].agentConversationId` - For debugging in Dust UI
- `results[].judgeResult.votes` - Individual judge scores
- `results[].judgeResult.agreement` - Judge consensus (0-1)
- `results[].wasTimeout` - Distinguishes timeout from other errors
- `results[].agentRetryCount` - Number of retries used
- `metadata.conversationIds` - All conversation IDs

## Running Long Evaluations with Monitoring

For long-running evaluations (many prompts, multiple agents, multiple runs), use background execution with periodic monitoring:

### Pattern for Background Execution with Monitoring

```bash
# 1. Start the evaluation in background (run_in_background: true)
# IMPORTANT: Use --timeout 10m for agent calls (some agents take a long time)
# DO NOT set a timeout on the Bash tool itself - it will kill the process!
bun run eval --agents "agent1,agent2" --csv "./prompts.csv" --judge "judge-id" \
  --runs 3 --judge-runs 3 --timeout 10m --resume --verbose

# 2. Use a blocking sleep for intervals (NOT background sleep)
sleep 300  # Wait 5 minutes (blocking, not background)

# 3. Check eval process output with BashOutput tool
# 4. Repeat steps 2-3 until complete
```

### Key Points

1. **Start eval with `run_in_background: true`** - This returns a shell ID immediately
2. **DO NOT set a timeout on the Bash tool call** - Let the process run indefinitely in background
3. **Use `--timeout 10m` for agent calls** - This is the per-agent-call timeout, not the overall process timeout
4. **Use blocking sleep for intervals** - Do NOT run sleep in background, just run `sleep 300` directly
5. **Check eval output after sleep completes** - Use `BashOutput` with the eval shell ID
6. **Process shows `status: completed` when done** - Check exit code 0 for success

### Why This Pattern

- Background eval allows monitoring without blocking
- NO Bash timeout means the process won't be killed prematurely
- Agent timeout (10m) handles individual slow responses
- Blocking sleep prevents excessive polling (don't poll the sleep timer!)
- Checkpointing enables resume if interrupted
- `--resume` flag continues from last checkpoint automatically

### Monitoring Cadence

- **5 minutes** is a good default interval for large evaluations
- Check `[Checkpoint saved: N results]` lines to track progress
- Watch for retry messages (Google AI Studio overload, timeouts, etc.)
