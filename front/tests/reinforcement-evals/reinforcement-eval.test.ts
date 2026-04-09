import type { Authenticator } from "@app/lib/auth";
import { validateToolCallAssertion } from "@app/tests/reinforcement-evals/lib/assertions";
import {
  BATCH_TIMEOUT_MS,
  FILTER_CATEGORY,
  FILTER_SCENARIO,
  getReinforcementEvalAuth,
  JUDGE_RUNS,
  PASS_THRESHOLD,
  RUN_REINFORCEMENT_EVAL,
  TIMEOUT_MS,
  USE_BATCH,
  VERBOSE,
} from "@app/tests/reinforcement-evals/lib/config";
import { evaluateWithJudge } from "@app/tests/reinforcement-evals/lib/judge";
import {
  executeBatch,
  executeReinforced,
} from "@app/tests/reinforcement-evals/lib/reinforcement-executor";
import { filterTestCases } from "@app/tests/reinforcement-evals/lib/suite-loader";
import type {
  CategorizedTestCase,
  ExecutionResult,
  ToolCall,
} from "@app/tests/reinforcement-evals/lib/types";
import { allTestSuites } from "@app/tests/reinforcement-evals/test-suites";
import { beforeAll, describe, expect, it, vi } from "vitest";

function formatToolCallSummary(tc: ToolCall): string {
  const args = tc.arguments as Record<string, unknown>;
  switch (tc.name) {
    case "suggest_skill_instruction_edits": {
      const suggestions = args.suggestions as
        | Array<{ skillId?: string }>
        | undefined;
      if (suggestions) {
        const items = suggestions.map((s) => s.skillId ?? "?").join(", ");
        return `suggest_skill_instruction_edits(${items})`;
      }
      return "suggest_skill_instruction_edits()";
    }
    case "suggest_skill_tools": {
      const suggestions = args.suggestions as
        | Array<{ skillId?: string; action?: string; toolId?: string }>
        | undefined;
      if (suggestions) {
        const items = suggestions
          .map(
            (s) =>
              `${s.action ?? "?"} ${s.toolId ?? "?"} on ${s.skillId ?? "?"}`
          )
          .join(", ");
        return `suggest_skill_tools(${items})`;
      }
      return "suggest_skill_tools()";
    }
    default:
      return tc.name;
  }
}

function formatToolCalls(toolCalls: ToolCall[]): string {
  return toolCalls.map(formatToolCallSummary).join(", ");
}

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

const testCases = RUN_REINFORCEMENT_EVAL
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

describe.skipIf(!RUN_REINFORCEMENT_EVAL)(
  "Reinforced Skills Evaluation Tests",
  () => {
    let auth: Authenticator;

    // In batch mode, all results are pre-computed in beforeAll.
    let batchResults: Map<string, ExecutionResult> | null = null;

    beforeAll(
      async () => {
        auth = await getReinforcementEvalAuth();

        if (USE_BATCH) {
          batchResults = await executeBatch(auth, testCases);
        }
      },
      USE_BATCH ? BATCH_TIMEOUT_MS : TIMEOUT_MS
    );

    for (const [category, scenarios] of testGroups) {
      describe(category, () => {
        for (const [scenarioId, testCase] of scenarios) {
          // In batch mode tests are sequential (results already computed).
          // In non-batch mode tests run concurrently via streaming.
          const testFn = USE_BATCH ? it : it.concurrent;

          testFn(
            scenarioId,
            async () => {
              const result: ExecutionResult = USE_BATCH
                ? (() => {
                    const r = batchResults!.get(scenarioId);
                    if (!r) {
                      throw new Error(
                        `No batch result for scenario "${scenarioId}"`
                      );
                    }
                    return r;
                  })()
                : await executeReinforced(auth, testCase);

              const { responseText, toolCalls } = result;

              if (VERBOSE) {
                console.log(
                  `[${scenarioId}] Tool calls:`,
                  JSON.stringify(toolCalls, null, 2)
                );
                console.log(`[${scenarioId}] Response:`, responseText);
              }

              const judgeResult = await evaluateWithJudge(
                auth,
                testCase,
                toolCalls,
                responseText,
                JUDGE_RUNS
              );

              const passedJudge = judgeResult.finalScore >= PASS_THRESHOLD;
              const toolCallsSummary = formatToolCalls(toolCalls);

              for (const assertion of testCase.expectedToolCalls ?? []) {
                const result = validateToolCallAssertion(assertion, toolCalls);
                expect(
                  result.success,
                  `${!result.success ? result.error : ""}\n\nTool calls: [${toolCallsSummary}]\nResponse:\n${responseText}`
                ).toBe(true);
              }

              expect(
                passedJudge,
                `Judge score ${judgeResult.finalScore} < threshold ${PASS_THRESHOLD}\nReasoning: ${judgeResult.reasoning}\n\nTool calls: [${toolCallsSummary}]\nResponse:\n${responseText}`
              ).toBe(true);
            },
            TIMEOUT_MS
          );
        }
      });
    }
  }
);
