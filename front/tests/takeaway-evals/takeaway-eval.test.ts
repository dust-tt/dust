import type { Authenticator } from "@app/lib/auth";
import { validateTakeawayAssertion } from "@app/tests/takeaway-evals/lib/assertions";
import {
  FILTER_SCENARIO,
  getTakeawayEvalAuth,
  JUDGE_RUNS,
  PASS_THRESHOLD,
  RUN_TAKEAWAY_EVAL,
  TIMEOUT_MS,
  VERBOSE,
} from "@app/tests/takeaway-evals/lib/config";
import { evaluateWithJudge } from "@app/tests/takeaway-evals/lib/judge";
import { filterTestCases } from "@app/tests/takeaway-evals/lib/suite-loader";
import { executeTakeawayExtraction } from "@app/tests/takeaway-evals/lib/takeaway-executor";
import {
  type CategorizedTakeawayTestCase,
  formatExtractionResult,
} from "@app/tests/takeaway-evals/lib/types";
import { allTestSuites } from "@app/tests/takeaway-evals/test-suites";
import { beforeAll, describe, expect, it, vi } from "vitest";

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

const testCases = RUN_TAKEAWAY_EVAL
  ? filterTestCases(allTestSuites, {
      scenarioId: FILTER_SCENARIO,
    })
  : [];

const testGroups = new Map<string, Map<string, CategorizedTakeawayTestCase>>();
for (const testCase of testCases) {
  if (!testGroups.has(testCase.suiteName)) {
    testGroups.set(testCase.suiteName, new Map());
  }
  testGroups.get(testCase.suiteName)!.set(testCase.scenarioId, testCase);
}

describe.skipIf(!RUN_TAKEAWAY_EVAL)(
  "Document Takeaway Extraction Evaluation Tests",
  () => {
    let auth: Authenticator;

    beforeAll(async () => {
      auth = await getTakeawayEvalAuth();
    }, TIMEOUT_MS);

    for (const [suiteName, scenarios] of testGroups) {
      describe(suiteName, () => {
        for (const [scenarioId, testCase] of scenarios) {
          it.concurrent(
            scenarioId,
            async () => {
              const result = await executeTakeawayExtraction(auth, testCase);

              if (VERBOSE) {
                console.log(
                  `[${scenarioId}] Extraction: ${formatExtractionResult(result)}`
                );
              }

              const judgeResult = await evaluateWithJudge(
                auth,
                testCase,
                result,
                JUDGE_RUNS
              );

              if (VERBOSE) {
                console.log(
                  `[${scenarioId}] Judge Result:`,
                  JSON.stringify(judgeResult, null, 2)
                );
              }

              const passedJudge = judgeResult.finalScore >= PASS_THRESHOLD;
              const resultSummary = formatExtractionResult(result);

              for (const assertion of testCase.expectedAssertions) {
                const validationResult = validateTakeawayAssertion(
                  assertion,
                  result
                );
                expect(
                  validationResult.success,
                  `${!validationResult.success ? validationResult.error : ""}\n\nExtraction: [${resultSummary}]`
                ).toBe(true);
              }

              expect(
                passedJudge,
                `Judge score ${judgeResult.finalScore} < threshold ${PASS_THRESHOLD}\nReasoning: ${judgeResult.reasoning}\n\nExtraction: [${resultSummary}]`
              ).toBe(true);
            },
            TIMEOUT_MS
          );
        }
      });
    }
  }
);
