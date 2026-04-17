# Document Takeaway Extraction Evaluation Tests

End-to-end eval suite for the document takeaway extraction pipeline. Tests whether
`extractDocumentTakeaways` correctly identifies action items, notable facts, and key decisions
from various document types.

Each test case checks two things:

- **Deterministic assertions** — structural checks on the extracted takeaways (e.g., "should
  extract an action item containing 'migration'", "should not assign to non-member user").
- **LLM-as-judge** — a separate LLM scores the quality of the extraction against
  scenario-specific criteria.

## Architecture

```
tests/takeaway-evals/
├── README.md                          # This file
├── vite.config.mjs                    # Test runner configuration
├── takeaway-eval.test.ts              # Main Vitest entry point
├── lib/
│   ├── types.ts                       # Test case schema + assertion helpers
│   ├── config.ts                      # Env vars, auth, model setup
│   ├── assertions.ts                  # Deterministic takeaway validators
│   ├── judge.ts                       # LLM-as-judge evaluation
│   ├── suite-loader.ts                # Suite filtering and categorization
│   └── takeaway-executor.ts           # Calls real LLM pipeline with mock data
└── test-suites/
    ├── index.ts                       # Exports allTestSuites array
    ├── action-items.ts                # Action item extraction scenarios
    ├── notable-facts.ts               # Notable fact extraction scenarios
    ├── key-decisions.ts               # Key decision extraction scenarios
    └── mixed-extraction.ts            # Multi-category and re-analysis scenarios
```

### Layers

**Layer 1 — Scenario definition** (`lib/types.ts`, `test-suites/`)

Test scenarios are plain TypeScript objects defining a document (text + type), project members,
optional previous extraction results, expected assertions, and judge criteria. No database is
involved.

**Layer 2 — Execution** (`lib/takeaway-executor.ts`)

Assembles the prompt exactly as `extractDocumentTakeaways` does (using `buildPromptForSourceType`,
`buildPromptActionItems`, etc.), but replaces the DB-dependent `buildPromptProjectMembers` with
a mock that uses test data. Calls the real `runMultiActionsAgent` LLM pipeline and post-processes
with the real `buildActionItems`, `buildNotableFacts`, and `buildKeyDecisions` functions.

**Layer 3 — Scoring** (`lib/assertions.ts` + `lib/judge.ts`)

Two independent scoring mechanisms:
- Deterministic assertions: `shouldExtractActionItem`, `shouldNotExtractActionItem`,
  `shouldExtractNotableFact`, `shouldExtractKeyDecision`, `minActionItems`, `maxActionItems`,
  `shouldPreserveSId`, `shouldNotAssignTo` — structural checks on the extraction result.
- LLM-as-judge: a separate model (gpt-5-mini) scores the extraction 0–3 against
  scenario-specific criteria, with majority voting over N runs.

**Layer 4 — Test runner** (`takeaway-eval.test.ts`)

Vitest-based, gated by `RUN_TAKEAWAY_EVAL` env var. Each scenario runs concurrently.
Fails if either scoring mechanism doesn't meet the threshold.

### Mock strategy

The executor builds the prompt string directly using the same `buildPrompt*` functions from
production code, but replaces `buildPromptProjectMembers` (which hits the DB via
`SpaceResource.fetchById` and `UserResource.fetchByModelIds`) with a mock that formats test
member data in the same way. The LLM call and post-processing are fully real.

### Scenario types

| Suite | Scenarios | What they test |
|---|---|---|
| `action-items` | 5 | Task extraction, agent filtering, done transitions, invalid assignees, vague items |
| `notable-facts` | 2 | Constraint extraction, knowledge document facts |
| `key-decisions` | 3 | Decided vs open status, minor preference exclusion |
| `mixed-extraction` | 3 | Multi-category extraction, empty documents, re-analysis carry-forward |

## Quick start

```bash
# Run all takeaway eval tests
NODE_ENV=test \
  TEST_FRONT_DATABASE_URI="$FRONT_DATABASE_URI"_test \
  RUN_TAKEAWAY_EVAL=true \
  npm run test -- tests/takeaway-evals/takeaway-eval.test.ts --config tests/takeaway-evals/vite.config.mjs
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `RUN_TAKEAWAY_EVAL` | `false` | Set to `true` to enable the tests (skipped otherwise). |
| `TAKEAWAY_MODEL_ID` | `claude-haiku-4-5-20251001` | Model used for the extraction LLM calls. |
| `JUDGE_RUNS` | `3` | Number of judge evaluations per test (majority vote). |
| `PASS_THRESHOLD` | `2` | Minimum judge score (0–3) required to pass. |
| `FILTER_SCENARIO` | _(all)_ | Run only the test with the given scenario ID. |
| `VERBOSE` | `false` | Set to `true` to log extractions and judge responses. |
| `DUST_MANAGED_ANTHROPIC_API_KEY` | — | Anthropic API key (required for Claude models). |
| `DUST_MANAGED_OPENAI_API_KEY` | — | OpenAI API key (required for GPT judge model). |

## Adding a new scenario

1. Choose the appropriate test suite file (or create a new one in `test-suites/`).
2. Add a new entry to the `testCases` array:
   ```ts
   {
     scenarioId: "my-new-scenario",
     document: {
       id: "doc-new",
       title: "Meeting notes",
       type: "slack",
       text: "Alice: I'll deploy the fix by Friday\nBob: Sounds good",
       uri: "https://example.com/doc-new",
     },
     members: [
       { sId: "user-alice", fullName: "Alice Martin", email: "alice@co.com" },
       { sId: "user-bob", fullName: "Bob Chen", email: "bob@co.com" },
     ],
     expectedAssertions: [
       shouldExtractActionItem("deploy", { assigneeUserId: "user-alice" }),
     ],
     judgeCriteria: `Alice commits to deploying the fix by Friday...`,
   }
   ```
3. If creating a new suite file, import and add it to `test-suites/index.ts`.
4. Run the tests to verify.
