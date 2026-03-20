# Reinforced Agent Evaluation Tests

End-to-end eval suite for the reinforced agent pipeline. Tests both phases:

1. **Analyse conversation** — given an agent config and a conversation, does the model produce the expected synthetic suggestions?
2. **Aggregate suggestions** — given a set of synthetic suggestions, does the model merge and prioritise them correctly?

Each test case checks two things:

- **Expected tool calls** — the right tools were invoked (e.g. `suggest_prompt_edits`, `suggest_tools`).
- **LLM-as-judge** — a separate LLM scores the quality of the suggestions against scenario-specific criteria.

## Quick start

```bash
# Run all tests (streaming / non-batch mode)
NODE_ENV=test \
  TEST_FRONT_DATABASE_URI="$FRONT_DATABASE_URI"_test \
  RUN_REINFORCED_EVAL=true \
  npm run test -- tests/reinforced-agent-evals/reinforced-agent-eval.test.ts --config tests/reinforced-agent-evals/vite.config.mjs

```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `RUN_REINFORCED_EVAL` | `false` | Set to `true` to enable the tests (skipped otherwise). |
| `USE_BATCH` | `false` | Set to `true` to submit all prompts via the LLM batch API instead of streaming each individually. |
| `REINFORCED_MODEL_ID` | `claude-sonnet-4-6` | Model used for the reinforced agent LLM calls. |
| `JUDGE_RUNS` | `3` | Number of judge evaluations per test (majority vote). |
| `PASS_THRESHOLD` | `2` | Minimum judge score (0-3) required to pass. |
| `FILTER_CATEGORY` | _(all)_ | Run only tests in the given category (suite name). |
| `FILTER_SCENARIO` | _(all)_ | Run only the test with the given scenario ID. |
| `VERBOSE` | `false` | Set to `true` to log full tool call arguments and response text for each scenario. |
| `DUST_MANAGED_ANTHROPIC_API_KEY` | — | Anthropic API key (required for Claude models). |
| `DUST_MANAGED_OPENAI_API_KEY` | — | OpenAI API key (required for GPT judge model). |

## Batch vs streaming mode

**Streaming (default)** — each test case runs its LLM call concurrently via streaming. Fast feedback, good for development.

**Batch** — all prompts are submitted as a single LLM batch request. The test suite polls until results are ready, then evaluates. Better cost efficiency, but slower turnaround.


