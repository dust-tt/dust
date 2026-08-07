import type { RunUsageForAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import {
  buildRunUsageAttribution,
  buildToolAttribution,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { GPT_5_MINI_MODEL_ID } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

const DEFAULT_PROMPT_TOKENS_COUNT = 100;
const DEFAULT_COMPLETION_TOKENS_COUNT = 20;
const COMPLETION_TOKENS_COUNT_WITH_REASONING = 25;
const REASONING_TOKENS_COUNT = 5;
const TOOL_CALL_OUTPUT_TOKENS_COUNT = 8;
const TOOL_RESULT_INPUT_TOKENS_COUNT = 12;
const DIRECT_TOOL_CREDIT_AMOUNT_MICRO = 3_000_000;
const EXPECTED_TOOL_GROSS_ATTRIBUTED_CREDIT_AMOUNT_MICRO = 3_002_235;

const usage = (
  overrides: Partial<RunUsageForAttribution> = {}
): RunUsageForAttribution => ({
  modelId: GPT_5_MINI_MODEL_ID,
  promptTokens: DEFAULT_PROMPT_TOKENS_COUNT,
  completionTokens: DEFAULT_COMPLETION_TOKENS_COUNT,
  reasoningTokens: null,
  isBatch: false,
  ...overrides,
});

describe("agent message consumption attribution domain", () => {
  it("attributes provider totals without inventing reasoning", () => {
    const attribution = buildRunUsageAttribution({
      usage: usage(),
      toolCalls: [],
    });

    expect(attribution.modelItems).toMatchObject([
      {
        itemType: "input",
        inputTokensCount: DEFAULT_PROMPT_TOKENS_COUNT,
      },
      {
        itemType: "output",
        outputTokensCount: DEFAULT_COMPLETION_TOKENS_COUNT,
      },
    ]);
    expect(attribution.toolCalls).toEqual([]);
  });

  it("separates reasoning and tool calls from assistant output", () => {
    const attribution = buildRunUsageAttribution({
      usage: usage({
        completionTokens: COMPLETION_TOKENS_COUNT_WITH_REASONING,
        reasoningTokens: REASONING_TOKENS_COUNT,
      }),
      toolCalls: [
        { tool: "first", measuredOutputTokensCount: 4 },
        { tool: "second", measuredOutputTokensCount: 6 },
      ],
    });

    expect(attribution.modelItems).toMatchObject([
      {
        itemType: "input",
        inputTokensCount: DEFAULT_PROMPT_TOKENS_COUNT,
      },
      { itemType: "output", outputTokensCount: 10 },
      {
        itemType: "reasoning",
        outputTokensCount: REASONING_TOKENS_COUNT,
      },
    ]);
    expect(attribution.toolCalls).toMatchObject([
      { tool: "first", outputTokensCount: 4 },
      { tool: "second", outputTokensCount: 6 },
    ]);
  });

  it("normalizes emitted tool calls proportionally within the provider completion total", () => {
    const measuredToolCalls = [
      { tool: "largest", measuredOutputTokensCount: 50 },
      { tool: "large", measuredOutputTokensCount: 20 },
      { tool: "medium", measuredOutputTokensCount: 15 },
      { tool: "small", measuredOutputTokensCount: 10 },
      { tool: "smallest", measuredOutputTokensCount: 5 },
    ];
    const expectedNormalizedTokensCounts = [10, 4, 3, 2, 1];
    const attribution = buildRunUsageAttribution({
      usage: usage({
        completionTokens: COMPLETION_TOKENS_COUNT_WITH_REASONING,
        reasoningTokens: REASONING_TOKENS_COUNT,
      }),
      toolCalls: measuredToolCalls,
    });

    expect(
      attribution.toolCalls.map((toolCall) => toolCall.outputTokensCount)
    ).toEqual(expectedNormalizedTokensCounts);
    expect(attribution.modelItems).toMatchObject([
      {
        itemType: "input",
        inputTokensCount: DEFAULT_PROMPT_TOKENS_COUNT,
      },
      { itemType: "output", outputTokensCount: 0 },
      {
        itemType: "reasoning",
        outputTokensCount: REASONING_TOKENS_COUNT,
      },
    ]);
  });

  it("maps a tool result to input and its emitted call to output", () => {
    const runAttribution = buildRunUsageAttribution({
      usage: usage(),
      toolCalls: [
        {
          tool: "search",
          measuredOutputTokensCount: TOOL_CALL_OUTPUT_TOKENS_COUNT,
        },
      ],
    });
    const toolCall = runAttribution.toolCalls[0];
    const toolAttribution = buildToolAttribution({
      usage: usage(),
      toolCall,
      inputTokensCount: TOOL_RESULT_INPUT_TOKENS_COUNT,
      directCreditAmountMicro: DIRECT_TOOL_CREDIT_AMOUNT_MICRO,
    });

    expect(toolAttribution).toMatchObject({
      tool: "search",
      inputTokensCount: TOOL_RESULT_INPUT_TOKENS_COUNT,
      outputTokensCount: TOOL_CALL_OUTPUT_TOKENS_COUNT,
      directCreditAmountMicro: DIRECT_TOOL_CREDIT_AMOUNT_MICRO,
    });
    expect(toolAttribution.grossAttributedCreditAmountMicro).toBe(
      EXPECTED_TOOL_GROSS_ATTRIBUTED_CREDIT_AMOUNT_MICRO
    );
  });

  it("rejects reasoning that cannot reconcile to provider completion", () => {
    expect(() =>
      buildRunUsageAttribution({
        usage: usage({ completionTokens: 5, reasoningTokens: 8 }),
        toolCalls: [{ tool: "search", measuredOutputTokensCount: 3 }],
      })
    ).toThrow("Reasoning tokens cannot exceed completion tokens");
  });
});
