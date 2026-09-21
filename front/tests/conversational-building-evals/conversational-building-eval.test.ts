import { validateFinalToolCall } from "@app/tests/conversational-building-evals/lib/assertions";
import {
  FILTER_CATEGORY,
  FILTER_SCENARIO,
  getBuildingAgentConfig,
  JUDGE_RUNS,
  PASS_THRESHOLD,
  RUN_CONVERSATIONAL_BUILDING_EVAL,
  SEED_TIMEOUT_MS,
  TIMEOUT_MS,
  VERBOSE,
} from "@app/tests/conversational-building-evals/lib/config";
import { executeBuildingAgent } from "@app/tests/conversational-building-evals/lib/executor";
import { evaluateWithJudge } from "@app/tests/conversational-building-evals/lib/judge";
import { seedScenario } from "@app/tests/conversational-building-evals/lib/seed";
import { filterTestCases } from "@app/tests/conversational-building-evals/lib/suite-loader";
import type {
  BuildingAgentConfig,
  CategorizedTestCase,
  EvalResult,
  SeededScenario,
  ToolCall,
} from "@app/tests/conversational-building-evals/lib/types";
import { allTestSuites } from "@app/tests/conversational-building-evals/test-suites";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalOpenAI = actual.OpenAI;
  class OpenAIWithBrowserSupport extends OriginalOpenAI {
    constructor(config: ConstructorParameters<typeof OriginalOpenAI>[0]) {
      super({ ...config, dangerouslyAllowBrowser: true });
    }
  }
  return { ...(actual as object), OpenAI: OpenAIWithBrowserSupport };
});

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalAnthropic = actual.default;
  class AnthropicWithBrowserSupport extends OriginalAnthropic {
    constructor(config: ConstructorParameters<typeof OriginalAnthropic>[0]) {
      super({ ...config, dangerouslyAllowBrowser: true });
    }
  }
  return { ...(actual as object), default: AnthropicWithBrowserSupport };
});

// Seeding a membership syncs the role to WorkOS over the network; there is no WorkOS user behind
// the factory-made members, so the call can only fail (slowly). Keep it local.
vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    userManagement: {
      listOrganizationMemberships: async () => ({ data: [] }),
      createOrganizationMembership: async () => ({}),
      updateOrganizationMembership: async () => ({}),
    },
  }),
}));

// Every LLM stream persists a `runs` row plus its usage. The evals stream many times per test
// from concurrent tests, which conflicts with the per-test CLS transaction and with the unique
// constraint on `dustRunId`. Usage accounting is not what these evals measure.
vi.mock("@app/lib/api/llm/run_lifecycle", () => ({
  LLMRunLifecycle: {
    start: async () => ({
      recordTokenUsage: async () => undefined,
      recordRunUsages: async () => undefined,
      close: async () => undefined,
    }),
  },
}));

function formatToolCalls(toolCalls: ToolCall[]): string {
  return toolCalls.map((tc) => tc.name).join(", ");
}

const evalResults: EvalResult[] = [];

const testCases = RUN_CONVERSATIONAL_BUILDING_EVAL
  ? filterTestCases(allTestSuites, {
      category: FILTER_CATEGORY,
      scenarioId: FILTER_SCENARIO,
    })
  : [];

const testGroups = new Map<string, Map<string, CategorizedTestCase>>();
for (const testCase of testCases) {
  if (!testGroups.has(testCase.category)) {
    testGroups.set(testCase.category, new Map());
  }
  testGroups.get(testCase.category)!.set(testCase.scenarioId, testCase);
}

describe
  .skipIf(!RUN_CONVERSATIONAL_BUILDING_EVAL)
  .concurrent("Conversational Building Evaluation Tests", () => {
    // One seeded workspace per scenario, plus the agent config built on it. Seeding is
    // sequential: the committed-transaction helper relies on a global CLS namespace.
    const seeded = new Map<
      string,
      { scenario: SeededScenario; config: BuildingAgentConfig }
    >();

    beforeAll(async () => {
      // Skill instructions are converted through the production markdown -> block HTML
      // pipeline, which is lazily required behind a path alias vitest cannot resolve.
      setupSkillInstructionsMarkdownPipeline();
      for (const testCase of testCases) {
        const scenario = await seedScenario(testCase);
        const config = await getBuildingAgentConfig(scenario.auth);
        seeded.set(testCase.scenarioId, { scenario, config });
      }
    }, SEED_TIMEOUT_MS);

    for (const [category, scenarios] of testGroups) {
      describe.concurrent(category, () => {
        for (const [scenarioId, testCase] of scenarios) {
          it.concurrent(
            scenarioId,
            async () => {
              const entry = seeded.get(scenarioId);
              if (!entry) {
                throw new Error(`Scenario "${scenarioId}" was not seeded`);
              }
              const { scenario, config } = entry;

              const execution = await executeBuildingAgent(
                scenario.auth,
                config,
                testCase
              );
              const { responseText, toolCalls, finalToolCall } = execution;

              if (VERBOSE) {
                console.log(
                  `[${scenarioId}] Tool calls:`,
                  JSON.stringify(toolCalls, null, 2)
                );
                console.log(`[${scenarioId}] Response:`, responseText);
              }

              const finalToolCallResult = validateFinalToolCall(
                testCase.expectedFinalToolCall,
                finalToolCall,
                scenario.skillIdsByKey
              );

              const judgeResult = await evaluateWithJudge(
                scenario,
                testCase,
                execution,
                JUDGE_RUNS
              );

              const passedJudge = judgeResult.finalScore >= PASS_THRESHOLD;
              const passed = passedJudge && finalToolCallResult.success;

              evalResults.push({ testCase, execution, judgeResult, passed });

              const context = `\n\nTool calls: [${formatToolCalls(toolCalls)}]\nFinal tool call: ${
                finalToolCall
                  ? `${finalToolCall.name}(${JSON.stringify(finalToolCall.arguments)})`
                  : "(none)"
              }\nResponse:\n${responseText}`;

              expect(
                finalToolCallResult.success,
                `${!finalToolCallResult.success ? finalToolCallResult.error : ""}${context}`
              ).toBe(true);

              expect(
                passedJudge,
                `Judge score ${judgeResult.finalScore} < threshold ${PASS_THRESHOLD}\nReasoning: ${judgeResult.reasoning}${context}`
              ).toBe(true);
            },
            TIMEOUT_MS
          );
        }
      });
    }

    afterAll(() => {
      if (evalResults.length === 0) {
        return;
      }

      // Scenarios that threw (LLM error, unknown tool, round cap) never record a result. They
      // still count as failures so the pass rate stays comparable across models.
      const evaluatedScenarioIds = new Set(
        evalResults.map((r) => r.testCase.scenarioId)
      );
      const erroredTestCases = testCases.filter(
        (t) => !evaluatedScenarioIds.has(t.scenarioId)
      );

      const totalCount = evalResults.length + erroredTestCases.length;
      const passedCount = evalResults.filter((r) => r.passed).length;
      const totalModelTimeMs = evalResults.reduce(
        (sum, r) => sum + r.execution.modelTimeMs,
        0
      );
      const [first] = seeded.values();
      const model = first?.config.model;
      const lines = [
        "",
        "=".repeat(60),
        `CONVERSATIONAL BUILDING EVAL SUMMARY (agent: ${first?.config.agentSId ?? "?"})`,
        "=".repeat(60),
        `Model: ${model?.modelId ?? "?"} (reasoning effort: ${model?.reasoningEffort ?? "default"})`,
        `Total scenarios: ${totalCount} (${erroredTestCases.length} errored)`,
        `Passed: ${passedCount}/${totalCount} (${((passedCount / totalCount) * 100).toFixed(0)}%)`,
        `Total agent model time: ${(totalModelTimeMs / 1000).toFixed(1)}s`,
        "-".repeat(60),
        ...evalResults.map((r) => {
          const status = r.passed ? "PASS" : "FAIL";
          return `  [${status}] ${r.testCase.category}/${r.testCase.scenarioId}: judge=${r.judgeResult.finalScore} ${(r.execution.modelTimeMs / 1000).toFixed(1)}s`;
        }),
        ...erroredTestCases.map(
          (t) => `  [ERR ] ${t.category}/${t.scenarioId}: errored`
        ),
        "=".repeat(60),
        "",
      ];
      console.log(lines.join("\n"));
    });
  });
