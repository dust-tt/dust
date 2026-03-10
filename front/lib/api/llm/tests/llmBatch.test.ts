import { isDeepStrictEqual } from "node:util";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { getLLM } from "@app/lib/api/llm";
import { createMockAuthenticator } from "@app/lib/api/llm/tests/conversations";
import { MODELS } from "@app/lib/api/llm/tests/models";
import type { ResponseChecker } from "@app/lib/api/llm/tests/types";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { isModelProviderId } from "@app/types/assistant/models/providers";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { describe, expect, it, vi } from "vitest";

const POLL_INTERVAL_MS = 5000;
const TEST_TIMEOUT_MS = 60 * 60 * 1000; // 1-hour timeout — batches can take a while

// Mock the openai module to inject dangerouslyAllowBrowser: true
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalOpenAI = actual.OpenAI;

  class OpenAIWithBrowserSupport extends OriginalOpenAI {
    constructor(config: ConstructorParameters<typeof OriginalOpenAI>[0]) {
      super({
        ...config,
        dangerouslyAllowBrowser: true,
      });
    }
  }

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    OpenAI: OpenAIWithBrowserSupport,
  };
});

// Mock the @anthropic-ai/sdk module to inject dangerouslyAllowBrowser: true
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalAnthropic = actual.default;

  class AnthropicWithBrowserSupport extends OriginalAnthropic {
    constructor(config: ConstructorParameters<typeof OriginalAnthropic>[0]) {
      super({
        ...config,
        dangerouslyAllowBrowser: true,
      });
    }
  }

  return {
    // @ts-expect-error actual is unknown
    ...actual,
    default: AnthropicWithBrowserSupport,
  };
});

const RUN_LLM_BATCH_TEST = process.env.RUN_LLM_BATCH_TEST === "true";
const RUN_ALL_MODEL_TESTS = process.env.RUN_ALL_MODEL_TESTS === "true";

const modelsWithBatchSupport = Object.entries(MODELS)
  .filter(([modelId, { providerId }]) => {
    const config = getSupportedModelConfig({
      modelId: modelId as ModelIdType,
      providerId,
    });
    return config?.supportsBatchProcessing === true;
  })
  .filter(([, config]) => config.runTest || RUN_ALL_MODEL_TESTS)
  .map(([modelId, config]) => ({ modelId, ...config }));

interface BatchConversation {
  id: string;
  streamParameters: LLMStreamParameters;
  expectedInResponse: ResponseChecker;
}

interface BatchTest {
  name: string;
  conversations: BatchConversation[];
}

function checkResponse(
  convId: string,
  events: LLMEvent[],
  checker: ResponseChecker
): void {
  if (checker === null) {
    return;
  }

  const errorEvent = events.find((e) => e.type === "error");
  if (errorEvent?.type === "error") {
    throw new Error(
      `Batch returned error for ${convId}: ${errorEvent.message}`
    );
  }

  switch (checker.type) {
    case "text_contains": {
      const textEvent = events.find((e) => e.type === "text_generated");
      expect(
        textEvent,
        `Expected text_generated event for ${convId}`
      ).toBeDefined();
      if (textEvent?.type === "text_generated") {
        const lowerText = textEvent.content.text.toLowerCase();
        const expected = checker.anyString.map((s) => s.toLowerCase());
        expect(
          expected.some((str) => lowerText.includes(str)),
          `Response for ${convId} should contain at least one of: ${expected.join(", ")}`
        ).toBe(true);
      }
      break;
    }
    case "has_tool_call": {
      const toolCallEvent = events.find((e) => e.type === "tool_call");
      expect(
        toolCallEvent,
        `Expected tool_call event for ${convId}`
      ).toBeDefined();
      if (toolCallEvent?.type === "tool_call") {
        expect(toolCallEvent.content.name).toBe(checker.toolName);
        expect(
          isDeepStrictEqual(
            toolCallEvent.content.arguments,
            checker.expectedArguments
          ),
          `Arguments mismatch for ${convId}: expected ${JSON.stringify(checker.expectedArguments)}, got ${JSON.stringify(toolCallEvent.content.arguments)}`
        ).toBe(true);
      }
      break;
    }
    case "check_json_output": {
      // Not applicable for batch tests
      break;
    }
    default:
      assertNever(checker);
  }
}

const getUserIdTool: AgentActionSpecification = {
  name: "GetUserId",
  description: "Get the user ID given the user's name.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The name of the user.",
      },
    },
    required: ["name"],
  },
};

const BATCH_TESTS: BatchTest[] = [
  {
    name: "simple math",
    conversations: [
      {
        id: "simple-math-1",
        streamParameters: {
          conversation: {
            messages: [
              {
                role: "user",
                name: "User",
                content: [
                  {
                    type: "text",
                    text: "What is 1+1? Reply with just the number.",
                  },
                ],
              },
            ],
          },
          prompt: "You are a helpful assistant.",
          specifications: [],
        },
        expectedInResponse: { type: "text_contains", anyString: ["2"] },
      },
      {
        id: "simple-math-2",
        streamParameters: {
          conversation: {
            messages: [
              {
                role: "user",
                name: "User",
                content: [
                  {
                    type: "text",
                    text: "What is 2+2? Reply with just the number.",
                  },
                ],
              },
            ],
          },
          prompt: "You are a helpful assistant.",
          specifications: [],
        },
        expectedInResponse: { type: "text_contains", anyString: ["4"] },
      },
    ],
  },
  {
    name: "forced tool call",
    conversations: [
      {
        id: "forced-tool-call",
        streamParameters: {
          conversation: {
            messages: [
              {
                role: "user",
                name: "User",
                content: [
                  { type: "text", text: "What is the user ID of Alice?" },
                ],
              },
            ],
          },
          prompt: "You are a helpful assistant.",
          specifications: [getUserIdTool],
          forceToolCall: "GetUserId",
        },
        expectedInResponse: {
          type: "has_tool_call",
          toolName: "GetUserId",
          expectedArguments: { name: "Alice" },
        },
      },
    ],
  },
];

/**
 * Batch Processing Integration Tests
 *
 * To run these tests from the front directory:
 *
 *   RUN_LLM_BATCH_TEST=true npx vitest --config lib/api/llm/tests/vite.config.js lib/api/llm/tests/llmBatch.test.ts --run
 */
describe.skipIf(!RUN_LLM_BATCH_TEST || modelsWithBatchSupport.length === 0)(
  "Batch Processing Integration Tests",
  () => {
    describe.concurrent.each(
      modelsWithBatchSupport
    )("$providerId / $modelId", ({ modelId, providerId }) => {
      if (!isModelProviderId(providerId)) {
        throw new Error(`Invalid providerId: ${providerId}`);
      }

      it.concurrent.each(BATCH_TESTS)(
        "$name",
        async ({ conversations }) => {
          const llm = await getLLM(createMockAuthenticator(), {
            modelId: modelId as ModelIdType,
            bypassFeatureFlag: true,
          });
          if (llm === null) {
            throw new Error("LLM instance is null");
          }

          const batchMap: Map<string, LLMStreamParameters> = new Map(
            conversations.map(({ id, streamParameters }) => [
              id,
              streamParameters,
            ])
          );

          const batchId = await llm.sendBatchProcessing(batchMap);
          expect(typeof batchId).toBe("string");
          expect(batchId.length).toBeGreaterThan(0);

          // Poll until the batch is done (up to the test timeout).
          let status = await llm.getBatchStatus(batchId);
          while (status === "computing") {
            await new Promise((resolve) =>
              setTimeout(resolve, POLL_INTERVAL_MS)
            );
            status = await llm.getBatchStatus(batchId);
          }

          expect(status).toBe("ready");

          const result = await llm.getBatchResult(batchId);
          expect(result.size).toBe(batchMap.size);

          for (const { id, expectedInResponse } of conversations) {
            const events = result.get(id);
            expect(
              events,
              `Expected results for conversation ${id}`
            ).toBeDefined();
            if (events) {
              checkResponse(id, events, expectedInResponse);
            }
          }
        },
        TEST_TIMEOUT_MS
      );
    });
  }
);
