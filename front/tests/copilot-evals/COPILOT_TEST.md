# Copilot Evaluation Tests

LLM-as-judge evaluation framework for the Agent Builder Copilot.

## Architecture

```
User Message → Copilot LLM → Tool Calls → Mock Responses → Final Response → Judge LLM → Score
```

**Key components:**

- `copilot-eval.test.ts` - Test runner with agentic loop simulation
- `lib/types.ts` - `TestCase`, `MockAgentState`, `CopilotConfig` types
- `lib/suite-loader.ts` - Filters test cases by category/scenario
- `test-suites/*.ts` - Test case definitions

## How It Works

1. **Load copilot config** from `_getCopilotGlobalAgent` (instructions + model)
2. **Build tool specs** from `AGENT_COPILOT_AGENT_STATE_SERVER` and `AGENT_COPILOT_CONTEXT_SERVER`
3. **Run agentic loop**: LLM calls tools → mock responses → repeat until text response
4. **Judge evaluation**: Separate LLM scores response quality (0-3 scale)

## Test Case Structure

```typescript
interface TestCase {
  scenarioId: string; // e.g., "NEW-001"
  userMessage: string; // What the user asks
  mockState: MockAgentState; // Agent state the copilot "sees"
  expectedToolCalls?: string[]; // Tools that should be called
  judgeCriteria: string; // How to evaluate the response
}
```

**Category** is derived from the parent `TestSuite.name`.

## Available Tools (Mocked)

From `agent_copilot_agent_state`:

- `get_agent_info` - Returns `mockState`

From `agent_copilot_context`:

- `get_available_models` / `get_available_skills` / `get_available_tools`
- `get_agent_feedback` / `get_agent_insights`
- `suggest_prompt_editions` / `suggest_tools` / `suggest_skills` / `suggest_model`
- `list_suggestions`

Mock responses are in `getMockToolResponse()` in `copilot-eval.test.ts`.

## Running Tests

```bash
cd front

# Single scenario
RUN_COPILOT_EVAL=true FILTER_SCENARIO=NEW-001 npm test -- \
  --config tests/copilot-evals/vite.config.mjs tests/copilot-evals/copilot-eval.test.ts

# All tests with 3 judge runs
RUN_COPILOT_EVAL=true JUDGE_RUNS=3 npm test -- \
  --config tests/copilot-evals/vite.config.mjs tests/copilot-evals/copilot-eval.test.ts
```

## Environment Variables

| Variable           | Default | Description                                 |
| ------------------ | ------- | ------------------------------------------- |
| `RUN_COPILOT_EVAL` | `false` | Must be `true` to run (skipped otherwise)   |
| `JUDGE_RUNS`       | `3`     | Number of judge evaluations (majority vote) |
| `PASS_THRESHOLD`   | `2`     | Minimum score to pass (0-3 scale)           |
| `FILTER_CATEGORY`  | -       | Filter by suite name                        |
| `FILTER_SCENARIO`  | -       | Filter by scenario ID                       |

## Adding Tests

1. Create/edit file in `test-suites/` (e.g., `new-agent.ts`)
2. Define `TestSuite` with test cases
3. Export from `test-suites/index.ts`

```typescript
export const mySuite: TestSuite = {
  name: "My Category",
  description: "...",
  testCases: [
    {
      scenarioId: "MY-001",
      userMessage: "...",
      mockState: {
        /* agent state */
      },
      expectedToolCalls: ["get_agent_info", "suggest_prompt_editions"],
      judgeCriteria: "The copilot should...",
    },
  ],
};
```

## Copilot Instructions

The copilot's system prompt is in:
`lib/api/assistant/global_agents/configurations/dust/copilot.ts`

Key tools referenced in instructions:

- `get_agent_config` - Live form state (client-side, not in server MCP)
- `get_agent_info` - Saved agent state (server-side MCP)
- `suggest_prompt_editions` - Create instruction suggestions

## Debugging

If tests fail with "no tools called":

1. Check tool names in copilot instructions match actual tool names
2. Verify `getMockToolResponse` handles the tool
3. Check the LLM is receiving tool specifications (log `copilotConfig.tools`)
