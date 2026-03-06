import type { Authenticator } from "@app/lib/auth";
import {
  COPILOT_AGENT,
  COPILOT_ON_COPILOT,
  COPILOT_ON_COPILOT_TIMEOUT_MS,
  FILTER_CATEGORY,
  FILTER_SCENARIO,
  getCopilotConfig,
  JUDGE_RUNS,
  PASS_THRESHOLD,
  RUN_COPILOT_EVAL,
  TIMEOUT_MS,
} from "@app/tests/sidekick-evals/lib/config";
import { evaluateWithJudge } from "@app/tests/sidekick-evals/lib/judge";
import { executeCopilot } from "@app/tests/sidekick-evals/lib/sidekick-executor";
import { generateCopilotImprovementSuggestions } from "@app/tests/sidekick-evals/lib/sidekick-on-sidekick";
import { filterTestCases } from "@app/tests/sidekick-evals/lib/suite-loader";
import type {
  CategorizedTestCase,
  CopilotConfig,
  EvalResult,
} from "@app/tests/sidekick-evals/lib/types";
import { allTestSuites } from "@app/tests/sidekick-evals/test-suites";
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

const evalResults: EvalResult[] = [];

const testCases = RUN_COPILOT_EVAL
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

describe.skipIf(!RUN_COPILOT_EVAL)("Copilot Evaluation Tests", () => {
  let copilotConfig: CopilotConfig;
  let auth: Authenticator;

  beforeAll(async () => {
    const result = await getCopilotConfig();
    copilotConfig = result.config;
    auth = result.auth;
  }, TIMEOUT_MS);

  for (const [category, scenarios] of testGroups) {
    describe(category, () => {
      for (const [scenarioId, testCase] of scenarios) {
        it.concurrent(
          scenarioId,
          async () => {
            const { responseText, toolCalls, modelTimeMs } =
              await executeCopilot(
                auth,
                copilotConfig,
                testCase,
                testCase.mockState
              );

            // Require either text response or tool calls (judge has access to tool calls)
            expect(
              responseText.length > 0 || toolCalls.length > 0,
              "Copilot returned empty response and no tool calls"
            ).toBe(true);

            const judgeResult = await evaluateWithJudge(
              auth,
              testCase,
              testCase.mockState,
              toolCalls,
              responseText,
              JUDGE_RUNS
            );

            const actualToolNames = toolCalls.map((t) => t.name);
            const missingTools = (testCase.expectedToolCalls ?? []).filter(
              (expected) => !actualToolNames.includes(expected)
            );
            const passedJudge = judgeResult.finalScore >= PASS_THRESHOLD;
            const passed = passedJudge && missingTools.length === 0;

            evalResults.push({
              testCase,
              responseText,
              toolCalls,
              judgeResult,
              passed,
              copilotModelTimeMs: modelTimeMs,
            });

            for (const missing of missingTools) {
              expect(
                actualToolNames,
                `Expected tool "${missing}" not called. Tools called: [${actualToolNames.join(", ")}]\n\nCopilot response:\n${responseText}`
              ).toContain(missing);
            }

            expect(
              passedJudge,
              `Judge score ${judgeResult.finalScore} < threshold ${PASS_THRESHOLD}\nReasoning: ${judgeResult.reasoning}\n\nCopilot response:\n${responseText}`
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

    const totalCopilotTimeMs = evalResults.reduce(
      (sum, r) => sum + r.copilotModelTimeMs,
      0
    );

    const passedCount = evalResults.filter((r) => r.passed).length;
    const passRate = ((passedCount / evalResults.length) * 100).toFixed(0);
    const lines = [
      "",
      "=".repeat(60),
      `COPILOT EVAL TIMING SUMMARY (agent: ${COPILOT_AGENT})`,
      "=".repeat(60),
      `Total scenarios: ${evalResults.length}`,
      `Passed: ${passedCount}/${evalResults.length} (${passRate}%)`,
      `Total copilot model time: ${(totalCopilotTimeMs / 1000).toFixed(1)}s`,
      `Average copilot model time per scenario: ${(totalCopilotTimeMs / evalResults.length / 1000).toFixed(1)}s`,
      "-".repeat(60),
      ...evalResults.map((r) => {
        const status = r.passed ? "PASS" : "FAIL";
        return `  [${status}] ${r.testCase.category}/${r.testCase.scenarioId}: ${(r.copilotModelTimeMs / 1000).toFixed(1)}s`;
      }),
      "=".repeat(60),
      "",
    ];
    console.log(lines.join("\n"));
  });

  if (COPILOT_ON_COPILOT) {
    afterAll(async () => {
      if (evalResults.length === 0) {
        return;
      }

      await generateCopilotImprovementSuggestions(
        auth,
        copilotConfig,
        evalResults
      );
    }, COPILOT_ON_COPILOT_TIMEOUT_MS);
  }
});
