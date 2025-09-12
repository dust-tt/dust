# Dust Agent Evaluation System

A comprehensive evaluation framework for testing and benchmarking Dust agents using CSV-based prompts and automated scoring.

## Overview

This tool allows you to:
- Evaluate multiple Dust agents against a set of test prompts
- Use a judge agent to score responses on a 0-3 scale
- Generate detailed reports in multiple formats (console, JSON, CSV)
- Run multiple evaluation rounds for statistical analysis
- Control parallelism and timeouts for optimal performance

## Prerequisites

### Bun Runtime (Required)

This project uses **Bun** exclusively as its JavaScript runtime. Do not use npm, node, yarn, pnpm, or any other runtime/package manager.

```bash
# Install Bun if not already installed
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

### Environment Variables

Set these environment variables before running evaluations:

```bash
export DUST_API_KEY="sk-..."     # Your Dust API key
export DUST_WORKSPACE_ID="..."   # Your Dust workspace ID
```

You can also create a `.env` file in the project root:
```env
DUST_API_KEY=sk-...
DUST_WORKSPACE_ID=...
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd dust-evals

# Install dependencies using Bun
bun install

# Build the project
bun run build

# Verify everything works
bun run check:all
```

## Usage

### Basic Evaluation

```bash
bun run eval \
  --agents "agent-sId-1,agent-sId-2" \
  --csv "./examples/simple.csv" \
  --judge "judge-agent-sId"
```

### Advanced Options

```bash
bun run eval \
  --agents "agent1,agent2,agent3" \
  --csv "./prompts/test-suite.csv" \
  --judge "strict-judge" \
  --runs 5 \                    # Run each prompt 5 times
  --parallel 10 \               # Process 10 requests in parallel
  --timeout 30000 \             # 30 second timeout per request
  --output json \               # Output format: json, csv, or console
  --output-file "./results/evaluation.json"
```

### Command-Line Options

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `--agents` | Comma-separated list of agent sIds to evaluate | Yes | - |
| `--csv` | Path to CSV file with prompts | Yes | - |
| `--judge` | sId of the judge agent | Yes | - |
| `--runs` | Number of times to run each prompt | No | 1 |
| `--parallel` | Number of parallel executions | No | 5 |
| `--timeout` | Timeout per agent call in milliseconds | No | 60000 |
| `--output` | Output format: json, csv, console | No | console |
| `--output-file` | Path to save results | No | - |

## CSV Format

The evaluation CSV must have two required columns:

```csv
prompt,judge_prompt
"What is 2 + 2?","The correct answer is 4."
"Explain photosynthesis","Should mention: plants, sunlight, CO2, oxygen, glucose production"
"Write a haiku about coding","Should be 5-7-5 syllable structure, relate to programming"
```

- **prompt**: The question or task sent to agents
- **judge_prompt**: Evaluation criteria for the judge agent (what constitutes a good answer)

## Scoring System

The judge agent scores each response on a 0-3 scale:

- **0**: Completely wrong or unhelpful response
- **1**: Partially correct but missing key elements
- **2**: Mostly correct with minor issues
- **3**: Excellent, complete, and accurate response

The judge must return scores in the format: `SCORE: <number>`

## Output Formats

### Console Output (Default)
Human-readable format showing:
- Configuration summary
- Per-agent statistics (average score, error rate, timing)
- Sample results
- Overall evaluation metrics

### JSON Output
Structured data containing:
- Complete configuration
- All individual results
- Statistical analysis per agent
- Timestamps and metadata

### CSV Output
Tabular format with columns:
- prompt
- agent_id
- run_number
- response
- score
- judge_reasoning
- duration_ms
- error (if any)

## Development

### Project Structure

```
dust-evals/
├── src/
│   ├── cli.ts           # Command-line interface
│   ├── types.ts         # TypeScript type definitions
│   ├── dust-client.ts   # Dust SDK wrapper
│   ├── evaluator.ts     # Core evaluation logic
│   ├── grading.ts       # Score extraction and formatting
│   ├── reporter.ts      # Output formatting and reporting
│   └── utils.ts         # Utility functions
├── examples/
│   ├── simple.csv       # Basic evaluation examples
│   └── complex.csv      # Advanced evaluation examples
├── CLAUDE.md            # AI assistant documentation
├── README.md            # This file
├── package.json         # Project configuration
├── tsconfig.json        # TypeScript configuration
├── .eslintrc.json       # ESLint rules
└── .prettierrc          # Code formatting rules
```

### Available Scripts

```bash
# Development
bun run build          # Build the project
bun run typecheck      # Check TypeScript types
bun run lint           # Run ESLint
bun run lint:fix       # Fix ESLint issues
bun run format         # Format code with Prettier
bun run check:all      # Run all checks

# Evaluation
bun run eval           # Run evaluation (with CLI args)
```

### Code Style

This project enforces strict code quality standards:

- **TypeScript**: Strict mode enabled with all safety checks
- **ESLint**: Enforces consistent code style and catches potential bugs
- **Prettier**: Automatic code formatting (80 char line width, no semicolons)

Always run checks before committing:
```bash
bun run check:all
```

### Modifying the Evaluation System

#### Adding New Features

1. **Modify Types** (`src/types.ts`):
   - Add new interfaces or types as needed
   - Update existing types carefully to maintain compatibility

2. **Update Evaluation Logic** (`src/evaluator.ts`):
   - Core evaluation loop and agent interaction
   - Parallelism and error handling

3. **Adjust Scoring** (`src/grading.ts`):
   - Score extraction from judge responses
   - Judge prompt formatting

4. **Enhance Reporting** (`src/reporter.ts`):
   - Add new output formats
   - Customize statistics and metrics

#### Changing the Scoring System

The current system uses a 0-3 scale defined in `src/types.ts`:

```typescript
export type Score = 0 | 1 | 2 | 3
```

To modify:
1. Update the `Score` type in `types.ts`
2. Adjust the `extractScore` function in `grading.ts`
3. Update the judge prompt in `formatJudgePrompt`
4. Update documentation

#### Error Handling

The system uses a Result pattern for error handling:

```typescript
type Result<T, E = Error> = 
  | { isOk: true; value: T }
  | { isOk: false; error: E }
```

All async operations return Results. Check with `.isOk` before accessing values.

## Troubleshooting

### Common Issues

1. **"Failed to retrieve agent message"**
   - Verify agent sIds are correct (exact match required)
   - Ensure agents are configured to respond to mentions
   - Check API key and workspace ID are valid

2. **Timeout Errors**
   - Increase `--timeout` value for slow agents
   - Reduce `--parallel` to lower concurrent load

3. **CSV Parse Errors**
   - Ensure CSV has required columns: `prompt` and `judge_prompt`
   - Check for proper quote escaping in CSV values
   - Verify file encoding is UTF-8

4. **Score Extraction Errors**
   - Ensure judge agent returns scores as `SCORE: 0`, `SCORE: 1`, `SCORE: 2`, or `SCORE: 3`
   - Check judge agent is properly configured

### Debug Mode

To see detailed error information, the system logs to stderr:
```bash
bun run eval ... 2> debug.log
```

## Examples

### Simple Factual Evaluation

```bash
bun run eval \
  --agents "gpt-4-turbo" \
  --csv "./examples/simple.csv" \
  --judge "strict-factual-judge"
```

### Multi-Agent Comparison

```bash
bun run eval \
  --agents "model-v1,model-v2,model-v3" \
  --csv "./examples/complex.csv" \
  --judge "comprehensive-judge" \
  --runs 10 \
  --output json \
  --output-file "./results/model-comparison.json"
```

### Quick Test Run

```bash
# Test with a single prompt, single run
echo 'prompt,judge_prompt
"What is 2+2?","The answer should be 4"' > test.csv

bun run eval \
  --agents "your-agent" \
  --csv "./test.csv" \
  --judge "your-judge"
```

### Comprehensive Production Evaluation

```bash
# Full production evaluation with all options
bun run eval \
  --agents "gpt-4-turbo,claude-3-opus,gemini-pro,llama-70b,mistral-large" \
  --csv "./prompts/comprehensive-test-suite.csv" \
  --judge "expert-evaluator" \
  --runs 8 \                      # Run each prompt 8 times per agent
  --parallel 15 \                 # Process 15 requests concurrently
  --timeout 900000 \              # 15 minute timeout (in milliseconds)
  --output json \                 # JSON format for programmatic analysis
  --output-file "./results/$(date +%Y%m%d_%H%M%S)_evaluation.json"

# This will:
# - Test 5 different agents
# - Run each prompt 8 times per agent for statistical significance
# - Allow up to 15 minutes per agent response (for complex reasoning tasks)
# - Process 15 agent calls in parallel for faster execution
# - Save timestamped JSON results for analysis
# - Total evaluations: (number of prompts) × 5 agents × 8 runs
```

### Long-Running Evaluation with High Parallelism

```bash
# For evaluating slow, complex reasoning tasks
bun run eval \
  --agents "reasoning-agent-v1,reasoning-agent-v2,reasoning-agent-v3" \
  --csv "./prompts/complex-reasoning.csv" \
  --judge "thorough-judge" \
  --runs 10 \                     # 10 runs for each prompt
  --parallel 20 \                 # High parallelism
  --timeout 1200000 \             # 20 minute timeout
  --output csv \                  # CSV for spreadsheet analysis
  --output-file "./results/reasoning-benchmark.csv" \
  2> "./logs/eval-$(date +%Y%m%d_%H%M%S).log"  # Capture debug logs
```

## Important Notes

- **Bun Only**: This project is built specifically for Bun. Do not use npm, yarn, or other package managers.
- **Lock File**: The `bun.lock` file should be committed to ensure consistent dependencies.
- **API Limits**: Be mindful of Dust API rate limits when running large evaluations.
- **Costs**: Agent calls may incur costs depending on your Dust plan and agent configurations.

## Contributing

1. Follow the existing code patterns and style
2. Maintain strict TypeScript types (no `any` without good reason)
3. Add appropriate error handling using the Result pattern
4. Update documentation for significant changes
5. Run all checks before committing:
   ```bash
   bun run check:all
   ```

## License

[Your License Here]

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the examples in the `examples/` directory
- Consult the `CLAUDE.md` file for detailed implementation notes