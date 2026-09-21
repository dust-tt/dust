# Conversational Building Evaluation Tests

LLM-as-judge eval suite for the `conversational-building` global skill (the
`building_agents_and_skills` MCP server), run through the Dust global agent.

## Architecture

```
seed workspace (skills, admin member) from the scenario
  → Dust prompt + enabled skill instructions + user message
  → Agent LLM → tool calls → real tool handlers against the seeded workspace
  → ... → final response
  → (1) final tool call assertion   (2) Judge LLM score (0-3)
```

1. **Seeding** (`lib/seed.ts`): each scenario gets its own workspace, an admin member, and the
   skills of its `workspaceSeed`, created through the test factories in a committed transaction
   (`beforeAll` runs before the per-test CLS transaction exists). The run then executes as that
   member, which the `suggest_*` tools require.
2. **Agent config** comes from `_getDustGlobalAgent`: the real instructions and model of the
   `dust` global agent, built on the scenario's workspace.
3. **Skill state**: the skill is already enabled, so its instructions are injected as the same
   `<dust_system>` message production uses, and the agent only sees the tools of the two servers
   the skill equips (`building_agents_and_skills`, `workspace_management`), under their prefixed
   names (`workspace_management__list_skills`, ...). `stake: "high"` tools are left out since
   production would ask the user before running them.
4. **Tool calls run for real** (`lib/tool-runner.ts`): the executor validates the arguments
   against the tool schema, calls the production handler with the scenario's authenticator, and
   feeds the text result back. Nothing is mocked: `list_skills` lists the seeded skills,
   `describe_skill` returns their stored block HTML, `suggest_*` records real suggestions (rolled
   back with the per-test transaction).
5. **Assertions**: the *final* tool call (last non-exploratory one, i.e. the last `suggest_*`)
   must match `expectedFinalToolCall`, and the judge must score the run at or above
   `PASS_THRESHOLD`.

## Test case structure

```typescript
interface TestCase {
  scenarioId: string;
  userMessage: string; // or `conversation: ConversationMessage[]`
  workspaceSeed: { skills: SeedSkill[] }; // created in the scenario's workspace before the run
  expectedFinalToolCall:
    | {
        type: "suggestSkillUpdate";
        skillKey: string; // SeedSkill.key: sIds are assigned at seed time
        edits?: ("instructionEdits" | "agentFacingDescriptionEdit")[];
      }
    | { type: "suggestAgentCreation" };
  judgeCriteria: string; // scenario-specific only, see below
}
```

`SeedSkill.instructions` is markdown; it is converted to block-structured HTML (with
`data-block-id`) at seed time, so the agent can target blocks like in production. Scenarios and
assertions refer to skills by `key` because the database assigns the sIds.

### Writing `judgeCriteria`

The judge prompt already checks intent, suggestion content (right skill, existing block ids,
preserved content, quality), tool usage and the closing message. Only add what is unique to the
scenario: the specific change that must appear, what must be left untouched, and "Score 0-1 if…"
dealbreakers.

## Running

```bash
cd front

RUN_CONVERSATIONAL_BUILDING_EVAL=true npm test -- \
  --config tests/conversational-building-evals/vite.config.mjs \
  tests/conversational-building-evals/conversational-building-eval.test.ts

# Single scenario, with full tool call logging
RUN_CONVERSATIONAL_BUILDING_EVAL=true VERBOSE=true \
  FILTER_SCENARIO=add-ticket-number-check npm test -- \
  --config tests/conversational-building-evals/vite.config.mjs \
  tests/conversational-building-evals/conversational-building-eval.test.ts
```

## Environment variables

| Variable                           | Default | Description                                                   |
| ---------------------------------- | ------- | ------------------------------------------------------------- |
| `RUN_CONVERSATIONAL_BUILDING_EVAL` | `false` | Must be `true` to run (skipped otherwise)                     |
| `BUILDING_MODEL_ID`                | -       | Override the agent model (e.g. `claude-sonnet-5`)             |
| `BUILDING_REASONING_EFFORT`        | -       | Override reasoning effort (`none`/`light`/`medium`/`high`)    |
| `JUDGE_RUNS`                       | `3`     | Number of judge evaluations (averaged)                        |
| `PASS_THRESHOLD`                   | `2`     | Minimum judge score to pass (0-3 scale)                       |
| `FILTER_CATEGORY`                  | -       | Filter by suite name (e.g. `update-skill`)                    |
| `FILTER_SCENARIO`                  | -       | Filter by scenario id                                         |
| `VERBOSE`                          | `false` | Log every tool call, its mocked output and the final response |
| `EVAL_MAX_CONCURRENCY`             | `5`     | Concurrent scenarios                                          |

## Adding tests

1. Create or edit a suite in `test-suites/` and export it from `test-suites/index.ts`.
2. To assert on another terminal tool (`suggest_skill_editors`, `suggest_skill_deletion`, …),
   add a `FinalToolCallAssertion` variant in `lib/types.ts` + `lib/assertions.ts`. Tools added to
   either server are picked up automatically by the tool runner.
3. Scenarios needing other seeded entities (agents, members, groups) extend `WorkspaceSeed` and
   `lib/seed.ts` with the matching factories.

## Database

The eval Vite config skips the base global setup, so the shared test database must already have
the schema. Run once (and again after pulling migrations):

```bash
NODE_ENV=test FRONT_DATABASE_URI="$TEST_FRONT_DATABASE_URI" npx tsx admin/db.ts
```
