# Dust Agent Evaluation System

A robust evaluation framework for testing and benchmarking Dust agents using CSV-based prompts and automated LLM-as-judge scoring with majority voting.

## Overview

This tool allows you to:
- Evaluate multiple Dust agents against a set of test prompts
- Use configurable scoring scales (binary, 0-3, 1-5, or 0-100)
- Employ majority voting with multiple judge runs for reliable scoring
- Track conversation IDs for debugging
- Resume interrupted evaluations from checkpoints
- Generate detailed reports in multiple formats

## Prerequisites

### Bun Runtime (Required)

This project uses **Bun** exclusively. Do not use npm, node, or yarn.

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

### Environment Variables

```bash
export DUST_API_KEY="sk-..."
export DUST_WORKSPACE_ID="..."
```

## Installation

```bash
bun install
bun run build
```

## Quick Start

```bash
# Basic evaluation
bun run eval \
  --agents "agent-sId-1,agent-sId-2" \
  --csv "./prompts.csv" \
  --judge "judge-agent-sId"

# Validate configuration first (dry run)
bun run eval \
  --agents "agent1,agent2" \
  --csv "./prompts.csv" \
  --judge "judge" \
  --dry-run
```

## CLI Reference

### Required Options

| Option | Description |
|--------|-------------|
| `--agents <list>` | Comma-separated agent sIds to evaluate |
| `--csv <path>` | Path to CSV file with prompts |
| `--judge <sId>` | Judge agent sId |

### Evaluation Options

| Option | Default | Description |
|--------|---------|-------------|
| `--runs <n>` | 1 | Runs per prompt per agent |
| `--judge-runs <n>` | 3 | Judge evaluations per response (majority voting) |
| `--parallel <n>` | 5 | Concurrent executions |
| `--timeout <dur>` | 2m | Timeout per call (e.g., 30s, 2m, 120000) |
| `--scale <type>` | 0-3 | Scoring scale: binary, 0-3, 1-5, 0-100 |

### Output Options

| Option | Default | Description |
|--------|---------|-------------|
| `--output <fmt>` | console | Output format: json, csv, console, html |
| `--output-file <path>` | - | Save results to file (required for html) |

### Retry Options

| Option | Default | Description |
|--------|---------|-------------|
| `--max-retries <n>` | 3 | Maximum retry attempts |
| `--retry-backoff <dur>` | 1s | Base backoff between retries |

### Filtering & Sampling

| Option | Description |
|--------|-------------|
| `--sample <n>` | Randomly sample N prompts |
| `--seed <n>` | Random seed for reproducible sampling |
| `--prompt-filter <f>` | Filter by index (1,3,5), range (1-5), or pattern (*climate*) |

### Flags

| Flag | Description |
|------|-------------|
| `--resume` | Resume from checkpoint |
| `--verbose` | Enable detailed logging |
| `--dry-run` | Validate without executing |
| `--min-agreement <0-1>` | Flag low judge agreement (e.g., 0.7) |
| `--config <path>` | Load config from JSON file |

## CSV Format

```csv
prompt,judge_prompt
"What is 2+2?","The correct answer is 4."
"Explain photosynthesis","Should mention plants, sunlight, CO2, oxygen."
```

## Scoring Scales

| Scale | Range | Use Case |
|-------|-------|----------|
| binary | 0-1 | Pass/fail evaluations |
| 0-3 | 0-3 | Quick quality assessment (default) |
| 1-5 | 1-5 | Likert-style ratings |
| 0-100 | 0-100 | Fine-grained scoring |

## Majority Voting

By default, each agent response is evaluated 3 times (`--judge-runs 3`). The final score is determined by:
- **Discrete scales (binary, 0-3, 1-5)**: Mode (most common score)
- **Continuous scale (0-100)**: Median

The system reports:
- **Agreement**: Percentage of judges that gave the majority score
- **Variance**: Statistical variance across judge scores

Use `--min-agreement 0.7` to flag results where judges disagreed significantly.

## Output Formats

### Console (default)

Human-readable summary with:
- Configuration overview
- Per-agent statistics (avg score, error rate, timing)
- Sample results
- Conversation IDs for debugging

### JSON

Full structured data including:
- All individual results with conversation IDs
- Judge votes and reasoning
- Statistical analysis
- Metadata for reproducibility

### CSV

Tabular format with columns:
- prompt, agent_id, run_number, response
- final_score, judge_votes, judge_agreement
- agent_duration_ms, agent_conversation_id
- error, was_timeout

### HTML

Interactive, self-contained HTML report featuring:
- Summary cards with key metrics
- Agent comparison bar chart
- Score distribution histogram
- Detailed per-agent statistics
- Searchable/filterable results table
- Click-to-expand result details with full prompts, responses, and judge votes
- Links to Dust conversations for debugging

Generate with:
```bash
bun run eval \
  --agents "agent1,agent2" \
  --csv "./prompts.csv" \
  --judge "judge" \
  --output html \
  --output-file "./report.html"
```

## Config File

Save repeated configurations in a JSON file:

```json
{
  "agents": ["agent1", "agent2"],
  "csv": "./prompts.csv",
  "judge": "judge-agent",
  "runs": 3,
  "judgeRuns": 3,
  "scale": "0-3",
  "parallel": 10,
  "timeout": "2m",
  "output": "json",
  "outputFile": "./results.json"
}
```

Use with: `bun run eval --config eval.json`

CLI options override config file values.

## Error Handling

### Retry Behavior

- **Retried**: Timeouts, rate limits (429), 5xx errors, network errors
- **Not retried**: 4xx client errors (400, 401, 403, 404)
- **Backoff**: Exponential with jitter (1s, 2s, 4s by default)

### Checkpointing

Progress is saved every 5 completions. Resume with `--resume`:

```bash
# If interrupted, resume with:
bun run eval --agents "..." --csv "..." --judge "..." --resume
```

## Debugging

All conversation IDs are captured in the output. To investigate a specific result:

1. Find the `agentConversationId` in the JSON/CSV output
2. Open in Dust: `https://dust.tt/w/{workspace}/assistant/{conversationId}`

## Examples

### Quick Spot Check

```bash
bun run eval \
  --agents "my-agent" \
  --csv "./prompts.csv" \
  --judge "judge" \
  --sample 5 \
  --judge-runs 1
```

### Production Evaluation

```bash
bun run eval \
  --agents "v1,v2,v3" \
  --csv "./full-test-suite.csv" \
  --judge "expert-evaluator" \
  --runs 3 \
  --judge-runs 5 \
  --parallel 10 \
  --timeout 5m \
  --scale 1-5 \
  --min-agreement 0.6 \
  --output json \
  --output-file "./results/$(date +%Y%m%d).json"
```

### Validate Before Running

```bash
bun run eval \
  --agents "agent1,agent2" \
  --csv "./prompts.csv" \
  --judge "judge" \
  --dry-run
```

## Development

```bash
# Type check
bun run typecheck

# Run tests
bun test

# Lint
bun run lint

# Format
bun run format

# All checks
bun run check:all
```

## Project Structure

```
dust-evals/
├── src/
│   ├── cli.ts           # Command-line interface
│   ├── types.ts         # TypeScript types & scales
│   ├── dust-client.ts   # Dust API client with retries
│   ├── evaluator.ts     # Main evaluation logic
│   ├── grading.ts       # Score extraction & majority voting
│   ├── reporter.ts      # Output formatting
│   ├── csv-loader.ts    # CSV parsing with filtering
│   ├── checkpoint.ts    # Resume functionality
│   └── *.test.ts        # Tests
├── examples/
│   ├── simple.csv
│   └── complex.csv
└── README.md
```

## Troubleshooting

### "Agent not found"
- Verify agent sId is correct (exact match)
- Check agent exists in your workspace
- Use `--dry-run` to validate before running

### Timeout Errors
- Increase `--timeout` (e.g., `--timeout 5m`)
- Reduce `--parallel` to lower concurrent load

### Low Agreement Scores
- Review judge prompts for clarity
- Increase `--judge-runs` for more data points
- Check if criteria are ambiguous

### Score Extraction Errors
- Ensure judge returns `SCORE: <number>` format
- Check judge agent is properly configured
- Review verbose output with `--verbose`
