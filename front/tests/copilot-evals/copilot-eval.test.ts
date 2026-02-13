import {
  COPILOT_ON_COPILOT,
  COPILOT_ON_COPILOT_TIMEOUT_MS,
  createMockAuthenticator,
  FILTER_CATEGORY,
  FILTER_SCENARIO,
  getCopilotConfig,
  JUDGE_RUNS,
  PASS_THRESHOLD,
  RUN_COPILOT_EVAL,
  TIMEOUT_MS,
} from "@app/tests/copilot-evals/lib/config";
import { executeCopilot } from "@app/tests/copilot-evals/lib/copilot-executor";
import { generateCopilotImprovementSuggestions } from "@app/tests/copilot-evals/lib/copilot-on-copilot";
import { evaluateWithJudge } from "@app/tests/copilot-evals/lib/judge";
import { filterTestCases } from "@app/tests/copilot-evals/lib/suite-loader";
import type {
  CategorizedTestCase,
  CopilotConfig,
  EvalResult,
} from "@app/tests/copilot-evals/lib/types";
import { allTestSuites } from "@app/tests/copilot-evals/test-suites";
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

  beforeAll(async () => {
    copilotConfig = await getCopilotConfig();
  }, TIMEOUT_MS);

  for (const [category, scenarios] of testGroups) {
    describe(category, () => {
      for (const [scenarioId, testCase] of scenarios) {
        it.concurrent(
          scenarioId,
          async () => {
            const auth = createMockAuthenticator();

            const { responseText, toolCalls } = await executeCopilot(
              auth,
              copilotConfig,
              testCase.userMessage,
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

            const passed = judgeResult.finalScore >= PASS_THRESHOLD;

            evalResults.push({
              testCase,
              responseText,
              toolCalls,
              judgeResult,
              passed,
            });

            const actualToolNames = toolCalls.map((t) => t.name);
            for (const expected of testCase.expectedToolCalls ?? []) {
              expect(
                actualToolNames,
                `Expected tool "${expected}" not called. Tools called: [${actualToolNames.join(", ")}]\n\nCopilot response:\n${responseText}`
              ).toContain(expected);
            }

            expect(
              passed,
              `Judge score ${judgeResult.finalScore} < threshold ${PASS_THRESHOLD}\nReasoning: ${judgeResult.reasoning}\n\nCopilot response:\n${responseText}`
            ).toBe(true);
          },
          TIMEOUT_MS
        );
      }
    });
  }

  if (COPILOT_ON_COPILOT) {
    afterAll(async () => {
      if (evalResults.length === 0) {
        return;
      }

      const auth = createMockAuthenticator();
      await generateCopilotImprovementSuggestions(
        auth,
        copilotConfig,
        evalResults
      );
    }, COPILOT_ON_COPILOT_TIMEOUT_MS);
  }
});
