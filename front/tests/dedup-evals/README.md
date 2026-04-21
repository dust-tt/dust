# TODO Deduplication Evaluation Tests

End-to-end eval suite for the project TODO semantic deduplication pipeline. Tests whether
`runDeduplicationLLMCall` correctly identifies when new candidate TODOs are semantic duplicates
of existing ones.

Each test case checks two things:

- **Deterministic assertions** — per-candidate match checks (e.g., "candidate 0 should match
  existing TODO X", "candidate 1 should be new").
- **LLM-as-judge** — a separate LLM scores the quality of the dedup decisions against
  scenario-specific criteria.

## Architecture

```
tests/dedup-evals/
├── README.md                          # This file
├── vite.config.mjs                    # Test runner configuration
├── dedup-eval.test.ts                 # Main Vitest entry point
├── lib/
│   ├── types.ts                       # Test case schema + assertion helpers
│   ├── config.ts                      # Env vars, auth, model setup
│   ├── assertions.ts                  # Deterministic per-candidate match validators
│   ├── judge.ts                       # LLM-as-judge evaluation
│   └── dedup-executor.ts             # Calls real runDeduplicationLLMCall
└── test-suites/
    ├── index.ts                       # Exports allTestSuites array
    └── todo-deduplication.ts          # Deduplication scenario definitions
```

### Layers

**Layer 1 — Scenario definition** (`lib/types.ts`, `test-suites/`)

Test scenarios are plain TypeScript objects defining existing TODOs (sId + text), new candidates
(itemId + text + category), and expected match outcomes. No database is involved.

**Layer 2 — Execution** (`lib/dedup-executor.ts`)

Calls the real `runDeduplicationLLMCall` from `@app/lib/project_todo/deduplicate_candidates`,
passing lightweight mock objects for `ProjectTodoResource`. This tests the full pipeline: prompt
building, LLM call, and response parsing.

**Layer 3 — Scoring** (`lib/assertions.ts` + `lib/judge.ts`)

Two independent scoring mechanisms:
- Deterministic assertions: `shouldMatchExisting(candidateIndex, existingSId)` and
  `shouldBeNew(candidateIndex)` — structural checks on the returned `Map<number, string>`.
- LLM-as-judge: a separate model (gpt-5-mini) scores the dedup decisions 0–3 against
  scenario-specific criteria, with majority voting over N runs.

**Layer 4 — Test runner** (`dedup-eval.test.ts`)

Vitest-based, gated by `RUN_DEDUP_EVAL` env var. Each scenario runs concurrently via streaming.
Fails if either scoring mechanism doesn't meet the threshold.

### Mock strategy

`runDeduplicationLLMCall` only accesses `.sId` and `.text` on existing TODO objects (for prompt
building). The executor casts minimal `{ sId, text }` objects as `ProjectTodoResource` to avoid
any database dependency — matching the reinforcement-evals pattern of keeping evals DB-free.

### Scenario types

| Scenario | Description |
|---|---|
| `exact-duplicate` | Candidate text nearly identical to existing TODO |
| `semantic-duplicate` | Same task, different wording |
| `genuinely-new` | Unrelated candidate alongside existing TODOs |
| `partial-overlap-distinct` | Related but distinct tasks (should NOT match) |
| `mixed-batch` | Multiple candidates: some duplicates, some new |
| `many-existing-one-match` | Many existing TODOs, candidate matches exactly one |
| `key-decision-dedup` | `to_know` category: equivalent decisions with different wording |

## Quick start

```bash
# Run all dedup eval tests
NODE_ENV=test \
  TEST_FRONT_DATABASE_URI="$FRONT_DATABASE_URI"_test \
  RUN_DEDUP_EVAL=true \
  npm run test -- tests/dedup-evals/dedup-eval.test.ts --config tests/dedup-evals/vite.config.mjs
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `RUN_DEDUP_EVAL` | `false` | Set to `true` to enable the tests (skipped otherwise). |
| `DEDUP_MODEL_ID` | `claude-sonnet-4-6` | Model used for the deduplication LLM calls. |
| `JUDGE_RUNS` | `3` | Number of judge evaluations per test (majority vote). |
| `PASS_THRESHOLD` | `2` | Minimum judge score (0–3) required to pass. |
| `FILTER_CATEGORY` | _(all)_ | Run only tests in the given category (suite name). |
| `FILTER_SCENARIO` | _(all)_ | Run only the test with the given scenario ID. |
| `VERBOSE` | `false` | Set to `true` to log match maps and response text. |
| `DUST_MANAGED_ANTHROPIC_API_KEY` | — | Anthropic API key (required for Claude models). |
| `DUST_MANAGED_OPENAI_API_KEY` | — | OpenAI API key (required for GPT judge model). |

## Adding a new scenario

1. Open `test-suites/todo-deduplication.ts`
2. Add a new entry to the `testCases` array:
   ```ts
   {
     scenarioId: "my-new-scenario",
     category: "to_do",
     existingTodos: [
       { sId: "existing-1", text: "Set up CI/CD pipeline" },
     ],
     candidates: [
       { itemId: "candidate-0", text: "Configure automated deployments" },
     ],
     expectedMatches: [
       shouldMatchExisting(0, "existing-1"),
     ],
     judgeCriteria: `The candidate describes the same task as the existing TODO...`,
   }
   ```
3. Run the tests to verify.
