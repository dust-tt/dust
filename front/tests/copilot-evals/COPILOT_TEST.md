# Copilot Evaluation Tests

LLM-as-judge evaluation framework for the Agent Builder Copilot.

## Architecture

```
User Message → Copilot LLM → Tool Calls → Mock Responses → Final Response → Judge LLM → Score
```

## How It Works

1. **Load copilot config** from `_getCopilotGlobalAgent` (instructions + model)
2. **Build tool specs** from `AGENT_COPILOT_AGENT_STATE_SERVER` and `AGENT_COPILOT_CONTEXT_SERVER`
3. **Run agentic loop**: LLM calls tools → mock responses → repeat until text response
4. **Judge evaluation**: Separate LLM scores response quality (0-3 scale)

## Test Case Structure

```typescript
interface TestCase {
  scenarioId: string;
  userMessage: string; // What the user asks
  mockState: MockAgentState; // Agent state the copilot "sees"
  expectedToolCalls?: string[]; // Tools that should be called
  judgeCriteria: string; // Scenario specific criteria to judge
}
```

### Writing judgeCriteria

**IMPORTANT FOR AGENTS**: When adding new test cases, the judge prompt already includes generic evaluation criteria (intent understanding, actionable response, tool usage, instruction quality). Only include scenario-specific criteria in `judgeCriteria`:

**Do NOT repeat generic criteria** like:

- "The copilot should understand the user's intent" (already in judge prompt)
- "Are suggestions actionable?" (already in judge prompt)
- "Did it use appropriate tools?" (already in judge prompt)
- "If suggest_prompt_edits was called, evaluate instruction quality" (already in judge prompt)

**DO include only what's unique to this scenario**:

- Specific content that should appear in the response
- Scenario-specific behavior (e.g., "should ask clarifying questions" for vague requests)
- Dealbreaker conditions ("Score 0-1 if...")

````

**Tips:**

- Focus on what makes THIS scenario unique
- Mention specific content that should appear
- Include "Score 0-1 if..." for dealbreaker failures
- Keep it concise - the judge has context from the generic checklist

## Running Tests

```bash
cd front

# Single scenario by name
RUN_COPILOT_EVAL=true FILTER_SCENARIO=clear-saas-support npm test -- \
  --config tests/copilot-evals/vite.config.mjs tests/copilot-evals/copilot-eval.test.ts

# Filter by category
RUN_COPILOT_EVAL=true FILTER_CATEGORY=new-agent npm test -- \
  --config tests/copilot-evals/vite.config.mjs tests/copilot-evals/copilot-eval.test.ts

# All tests
RUN_COPILOT_EVAL=true npm test -- \
  --config tests/copilot-evals/vite.config.mjs tests/copilot-evals/copilot-eval.test.ts
````

## Environment Variables

| Variable             | Default | Description                                        |
| -------------------- | ------- | -------------------------------------------------- |
| `RUN_COPILOT_EVAL`   | `false` | Must be `true` to run (skipped otherwise)          |
| `JUDGE_RUNS`         | `3`     | Number of judge evaluations (majority vote)        |
| `PASS_THRESHOLD`     | `2`     | Minimum score to pass (0-3 scale)                  |
| `FILTER_CATEGORY`    | -       | Filter by suite name (e.g., `new-agent`)           |
| `FILTER_SCENARIO`    | -       | Filter by scenario ID (e.g., `clear-saas-support`) |
| `COPILOT_ON_COPILOT` | `false` | Enable self-improvement analysis after all tests   |

## Copilot-on-Copilot (Self-Improvement)

When `COPILOT_ON_COPILOT=true`, the framework runs the copilot on itself after all tests:

1. Collects all failed test scenarios
2. Sends failures + current copilot instructions to copilot.
3. The copilot analyzes failures and suggests instruction improvements

```bash
RUN_COPILOT_EVAL=true COPILOT_ON_COPILOT=true npm test -- \
  --config tests/copilot-evals/vite.config.mjs tests/copilot-evals/copilot-eval.test.ts
```

## Adding Tests

1. Create/edit file in `test-suites/` (e.g., `new-agent.ts`)
2. Define `TestSuite` with test cases
3. Export from `test-suites/index.ts`
4. Use shared mock states from `shared-mock-states/index.ts`

## Debugging

If tests fail with "no tools called":

1. Check tool names in copilot instructions match actual tool names
2. Verify `getMockToolResponse` handles the tool
3. Check the LLM is receiving tool specifications (log `copilotConfig.tools`)
