import type { Authenticator } from "@app/lib/auth";
import {
  BATCH_TIMEOUT_MS,
  FILTER_CATEGORY,
  FILTER_SCENARIO,
  getReinforcedEvalAuth,
  JUDGE_RUNS,
  PASS_THRESHOLD,
  RUN_REINFORCED_EVAL,
  TIMEOUT_MS,
  USE_BATCH,
} from "@app/tests/reinforced-agent-evals/lib/config";
import { evaluateWithJudge } from "@app/tests/reinforced-agent-evals/lib/judge";
import {
  executeBatch,
  executeReinforced,
} from "@app/tests/reinforced-agent-evals/lib/reinforced-executor";
import { filterTestCases } from "@app/tests/reinforced-agent-evals/lib/suite-loader";
import type {
  CategorizedTestCase,
  ExecutionResult,
  ToolCall,
} from "@app/tests/reinforced-agent-evals/lib/types";
import { allTestSuites } from "@app/tests/reinforced-agent-evals/test-suites";
import { beforeAll, describe, expect, it, vi } from "vitest";

function formatToolCallSummary(tc: ToolCall): string {
  const args = tc.arguments as Record<string, unknown>;
  switch (tc.name) {
    case "suggest_tools": {
      const suggestions = args.suggestions as
        | Array<{ toolId?: string; action?: string }>
        | undefined;
      if (suggestions) {
        const items = suggestions
          .map((s) => `${s.action ?? "?"} ${s.toolId ?? "?"}`)
          .join(", ");
        return `suggest_tools(${items})`;
      }
      return "suggest_tools()";
    }
    case "suggest_skills": {
      const suggestions = args.suggestions as
        | Array<{ skillId?: string; action?: string }>
        | undefined;
      if (suggestions) {
        const items = suggestions
          .map((s) => `${s.action ?? "?"} ${s.skillId ?? "?"}`)
          .join(", ");
        return `suggest_skills(${items})`;
      }
      return "suggest_skills()";
    }
    case "suggest_prompt_edits": {
      const suggestions = args.suggestions as
        | Array<{ targetBlockId?: string }>
        | undefined;
      const count = suggestions?.length ?? 0;
      return `suggest_prompt_edits(${count} suggestion${count !== 1 ? "s" : ""})`;
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

const testCases = RUN_REINFORCED_EVAL
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

describe.skipIf(!RUN_REINFORCED_EVAL)(
  "Reinforced Agent Evaluation Tests",
  () => {
    let auth: Authenticator;

    // In batch mode, all results are pre-computed in beforeAll.
    let batchResults: Map<string, ExecutionResult> | null = null;

    beforeAll(
      async () => {
        auth = await getReinforcedEvalAuth();

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

              const judgeResult = await evaluateWithJudge(
                auth,
                testCase,
                toolCalls,
                responseText,
                JUDGE_RUNS
              );

              const actualToolNames = toolCalls.map((t) => t.name);
              const missingTools = (testCase.expectedToolCalls ?? []).filter(
                (expected) => !actualToolNames.includes(expected)
              );
              const passedJudge = judgeResult.finalScore >= PASS_THRESHOLD;

              const toolCallsSummary = formatToolCalls(toolCalls);

              for (const missing of missingTools) {
                expect(
                  actualToolNames,
                  `Expected tool "${missing}" not called. Tools called: [${toolCallsSummary}]\n\nResponse:\n${responseText}`
                ).toContain(missing);
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
