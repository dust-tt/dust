# Sidekick Evaluation Tests

LLM-as-judge evaluation framework for the Agent Builder Sidekick.

## Architecture

```
User Message → Sidekick LLM → Tool Calls → Mock Responses → Final Response → Judge LLM → Score
```

## How It Works

1. **Load sidekick config** from `_getSidekickGlobalAgent` (instructions + model)
2. **Build tool specs** from `AGENT_SIDEKICK_AGENT_STATE_SERVER`, `AGENT_SIDEKICK_CONTEXT_SERVER` and `ASK_USER_QUESTION_SERVER`
3. **Run agentic loop**: LLM calls tools → mock responses → repeat until text response
4. **Judge evaluation**: Separate LLM scores response quality (0-3 scale)

## Test Case Structure

```typescript
interface TestCase {
  scenarioId: string;
  userMessage: string; // What the user asks
  mockState: MockAgentState; // Agent state the sidekick "sees"
  expectedToolCalls?: string[]; // Tools that should be called
  judgeCriteria: string; // Scenario specific criteria to judge
  isFirstMessage?: boolean; // Run unseeded (see below)
  stopOnUserQuestion?: boolean; // End the run on ask_user_question (see below)
}
```

### Conversation position: `isFirstMessage`

Step 1 of the sidekick instructions requires `get_agent_config` on every message **except the first
of a conversation**, and `<user_confirmation_before_heavy_work>` makes it stop and ask before heavy
work. Scenarios are therefore seeded with a short prior exchange in which the user also grants
permission to act, so they are evaluated as follow-up turns and can assert `get_agent_config` plus
the suggestion calls.

Set `isFirstMessage: true` for scenarios that exist to test first-message behaviour (discovery,
clarifying questions). Those run unseeded and must NOT expect `get_agent_config`.

### Clarifying questions: `stopOnUserQuestion`

`ask_user_question` is part of the tool specs. There is no user to answer it, so by default it is
answered with a canned non-committal reply ("do whatever is the most intuitive for you") and the run
continues — scenarios that must end in a suggestion are judged on the work done after asking.

Set `stopOnUserQuestion: true` when the question itself is what the scenario tests ("must ask before
suggesting"). The run then ends at the question, and the question and its options become the
response text the judge sees.

### Writing judgeCriteria

**IMPORTANT FOR AGENTS**: When adding new test cases, the judge prompt already includes generic evaluation criteria (intent understanding, actionable response, tool usage, instruction quality). Only include scenario-specific criteria in `judgeCriteria`:

**Do NOT repeat generic criteria** like:

- "The sidekick should understand the user's intent" (already in judge prompt)
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
RUN_SIDEKICK_EVAL=true FILTER_SCENARIO=clear-saas-support npm test -- \
  --config tests/sidekick-evals/vite.config.mjs tests/sidekick-evals/sidekick-eval.test.ts

# Filter by category
RUN_SIDEKICK_EVAL=true FILTER_CATEGORY=new-agent npm test -- \
  --config tests/sidekick-evals/vite.config.mjs tests/sidekick-evals/sidekick-eval.test.ts

# All tests
RUN_SIDEKICK_EVAL=true npm test -- \
  --config tests/sidekick-evals/vite.config.mjs tests/sidekick-evals/sidekick-eval.test.ts
````

## Environment Variables

| Variable             | Default | Description                                        |
| -------------------- | ------- | -------------------------------------------------- |
| `RUN_SIDEKICK_EVAL`   | `false` | Must be `true` to run (skipped otherwise)          |
| `JUDGE_RUNS`         | `3`     | Number of judge evaluations (majority vote)        |
| `PASS_THRESHOLD`     | `2`     | Minimum score to pass (0-3 scale)                  |
| `FILTER_CATEGORY`    | -       | Filter by suite name (e.g., `new-agent`)           |
| `FILTER_SCENARIO`    | -       | Filter by scenario ID (e.g., `clear-saas-support`) |
| `SIDEKICK_ON_SIDEKICK` | `false` | Enable self-improvement analysis after all tests   |
| `SIDEKICK_MODEL_ID`   | -       | Override the sidekick model (e.g. `claude-sonnet-5`) |
| `SIDEKICK_REASONING_EFFORT` | -  | Override reasoning effort (`none`/`light`/`medium`/`high`) |
| `EVAL_MAX_CONCURRENCY` | `5`  | Concurrent scenarios. Raising it queues LLM requests until they time out |

## Comparing models

`SIDEKICK_MODEL_ID` / `SIDEKICK_REASONING_EFFORT` override the model returned by
`_getSidekickGlobalAgent`, so the same suites can be run against several models. The judge model
is unchanged, so scores stay comparable.

```bash
RUN_SIDEKICK_EVAL=true SIDEKICK_MODEL_ID=gpt-5.6-luna SIDEKICK_REASONING_EFFORT=high npm test -- \
  --config tests/sidekick-evals/vite.config.mjs tests/sidekick-evals/sidekick-eval.test.ts \
  2>&1 | tee /tmp/sidekick-eval-luna-high.log
```

## Sidekick-on-Sidekick (Self-Improvement)

When `SIDEKICK_ON_SIDEKICK=true`, the framework runs the sidekick on itself after all tests:

1. Collects all failed test scenarios
2. Sends failures + current sidekick instructions to sidekick.
3. The sidekick analyzes failures and suggests instruction improvements

```bash
RUN_SIDEKICK_EVAL=true SIDEKICK_ON_SIDEKICK=true npm test -- \
  --config tests/sidekick-evals/vite.config.mjs tests/sidekick-evals/sidekick-eval.test.ts
```

## Adding Tests

1. Create/edit file in `test-suites/` (e.g., `new-agent.ts`)
2. Define `TestSuite` with test cases
3. Export from `test-suites/index.ts`
4. Use shared mock states from `shared-mock-states/index.ts`

## Debugging

If tests fail with "no tools called":

1. Check tool names in sidekick instructions match actual tool names
2. Verify `getMockToolResponse` handles the tool
3. Check the LLM is receiving tool specifications (log `sidekickConfig.tools`)
