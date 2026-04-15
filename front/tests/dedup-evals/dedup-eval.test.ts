import type { Authenticator } from "@app/lib/auth";
import { validateDedupAssertion } from "@app/tests/dedup-evals/lib/assertions";
import {
  FILTER_SCENARIO,
  getDedupEvalAuth,
  JUDGE_RUNS,
  PASS_THRESHOLD,
  RUN_DEDUP_EVAL,
  TIMEOUT_MS,
  VERBOSE,
} from "@app/tests/dedup-evals/lib/config";
import { executeDedup } from "@app/tests/dedup-evals/lib/dedup-executor";
import { evaluateWithJudge } from "@app/tests/dedup-evals/lib/judge";
import { filterTestCases } from "@app/tests/dedup-evals/lib/suite-loader";
import {
  type CategorizedDedupTestCase,
  formatMatchMap,
} from "@app/tests/dedup-evals/lib/types";
import { allTestSuites } from "@app/tests/dedup-evals/test-suites";
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

const testCases = RUN_DEDUP_EVAL
  ? filterTestCases(allTestSuites, {
      scenarioId: FILTER_SCENARIO,
    })
  : [];

const testGroups = new Map<string, Map<string, CategorizedDedupTestCase>>();
for (const testCase of testCases) {
  if (!testGroups.has(testCase.suiteName)) {
    testGroups.set(testCase.suiteName, new Map());
  }
  testGroups.get(testCase.suiteName)!.set(testCase.scenarioId, testCase);
}

describe.skipIf(!RUN_DEDUP_EVAL)("TODO Deduplication Evaluation Tests", () => {
  let auth: Authenticator;

  beforeAll(async () => {
    auth = await getDedupEvalAuth();
  }, TIMEOUT_MS);

  for (const [suiteName, scenarios] of testGroups) {
    describe(suiteName, () => {
      for (const [scenarioId, testCase] of scenarios) {
        it.concurrent(
          scenarioId,
          async () => {
            const { matchMap } = await executeDedup(auth, testCase);

            if (VERBOSE) {
              console.log(
                `[${scenarioId}] Match map: ${formatMatchMap(matchMap)}`
              );
            }

            const judgeResult = await evaluateWithJudge(
              auth,
              testCase,
              matchMap,
              JUDGE_RUNS
            );

            if (VERBOSE) {
              console.log(
                `[${scenarioId}] Judge Result:`,
                JSON.stringify(judgeResult, null, 2)
              );
            }

            const passedJudge = judgeResult.finalScore >= PASS_THRESHOLD;
            const matchSummary = formatMatchMap(matchMap);

            for (const assertion of testCase.expectedMatches) {
              const result = validateDedupAssertion(assertion, matchMap);
              expect(
                result.success,
                `${!result.success ? result.error : ""}\n\nMatch map: [${matchSummary}]`
              ).toBe(true);
            }

            expect(
              passedJudge,
              `Judge score ${judgeResult.finalScore} < threshold ${PASS_THRESHOLD}\nReasoning: ${judgeResult.reasoning}\n\nMatch map: [${matchSummary}]`
            ).toBe(true);
          },
          TIMEOUT_MS
        );
      }
    });
  }
});
