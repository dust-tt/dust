import { isDeepStrictEqual } from "node:util";

import { assert, expect } from "vitest";

import { getLLM } from "@app/lib/api/llm";
import type { TestStructuredOutputKey } from "@app/lib/api/llm/tests/schemas";
import {
  TEST_RESPONSE_FORMATS,
  TEST_STRUCTURED_OUTPUT_SCHEMAS,
} from "@app/lib/api/llm/tests/schemas";
import type {
  ResponseChecker,
  TestConfig,
  TestConversation,
} from "@app/lib/api/llm/tests/types";
import { Authenticator } from "@app/lib/auth";
import type {
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types";
import { assertNever, safeParseJSON } from "@app/types";

const SYSTEM_PROMPT = "You are a helpful assistant.";

/**
 * Creates a mock Authenticator for testing purposes.
 * This is a minimal mock that bypasses actual authentication.
 */
function createMockAuthenticator(): Authenticator {
  return new Authenticator({
    workspace: null,
    user: null,
    role: "none",
    groups: [],
    subscription: null,
  });
}

function userMessage(text: string): ModelConversationTypeMultiActions {
  return {
    messages: [
      {
        role: "user",
        name: "User",
        content: [
          {
            type: "text",
            text: text,
          },
        ],
      },
    ],
  };
}

function userMessageWithImage(
  text: string,
  imageUrl: string
): ModelConversationTypeMultiActions {
  return {
    messages: [
      {
        role: "user",
        name: "User",
        content: [
          {
            type: "text",
            text: text,
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  };
}

function userToolCall(
  toolName: string,
  toolOutput: string
): ModelConversationTypeMultiActions {
  return {
    messages: [
      {
        role: "function",
        name: toolName,
        function_call_id: "000000001",
        content: toolOutput,
      },
    ],
  };
}

function containsTextChecker(anyString: string[]): ResponseChecker {
  return {
    type: "text_contains",
    anyString,
  };
}

function hasToolCall(
  toolName: string,
  expectedArguments: Record<string, unknown>
): ResponseChecker {
  return {
    type: "has_tool_call",
    toolName,
    expectedArguments,
  };
}

const TEST_CONFIGS: Pick<TestConfig, "temperature" | "reasoningEffort">[] = [
  { reasoningEffort: null },
  { reasoningEffort: "none" },
  { reasoningEffort: "light" },
  { reasoningEffort: "medium" },
  { reasoningEffort: "high" },
  { temperature: 1 },
  { temperature: 0.7 },
  { temperature: 0 },
  { temperature: 0.7, reasoningEffort: "medium" },
];

function checkJsonResponse(key: TestStructuredOutputKey): ResponseChecker {
  return {
    type: "check_json_output",
    schema: TEST_STRUCTURED_OUTPUT_SCHEMAS[key],
  };
}

export const TEST_CONVERSATIONS = [
  {
    id: "simple-math" as const,
    name: "Simple Math",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Be concise. What is 2+2? Just give the number."),
    ],
    expectedInResponses: [containsTextChecker(["4"])],
    configs: TEST_CONFIGS,
  },
  {
    id: "yes-no-question" as const,
    name: "Yes/No Question",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Answer only yes or no. Is Paris the capital of France?"),
    ],
    expectedInResponses: [containsTextChecker(["yes"])],
  },
  {
    id: "multi-step-conversation" as const,
    name: "2 steps conversation",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Be very brief. Hello my name is Stan ! How are you?"),
      userMessage("What is my name ?"),
    ],
    expectedInResponses: [null, containsTextChecker(["Stan"])],
  },
  {
    id: "tool-usage" as const,
    name: "Tool usage required",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("What is the id of Stan?"),
      userToolCall("GetUserId", "88888"),
    ],
    expectedInResponses: [
      hasToolCall("GetUserId", { name: "Stan" }),
      containsTextChecker(["88888", "88 888"]),
    ],
    specifications: [
      {
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
      },
    ],
  },
  {
    id: "tool-call-without-params" as const,
    name: "Tool call without params",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Use a call to list my files"),
      userToolCall("ListFiles", "[users.pdf,zebra.png]"),
    ],
    expectedInResponses: [
      hasToolCall("ListFiles", {}),
      containsTextChecker(["users.pdf", "zebra.png"]),
    ],
    specifications: [
      {
        name: "ListFiles",
        description: "List all files in the user's account.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  },
  {
    id: "force-tool-usage" as const,
    name: "Force tool usage",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [userMessage("What is the current date?")],
    expectedInResponses: [hasToolCall("GetCurrentDate", {})],
    specifications: [
      {
        name: "GetCurrentDate",
        description: "Get the current date.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
    forceToolCall: "GetCurrentDate",
  },
] satisfies TestConversation[];

export const TEST_VISION_CONVERSATIONS = [
  {
    id: "image-description" as const,
    name: "Image description",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessageWithImage(
        "Describe this image.",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/481px-Cat03.jpg"
      ),
    ],
    expectedInResponses: [containsTextChecker(["cat"])],
  },
] satisfies TestConversation[];

export const TEST_STRUCTURED_OUTPUT_CONVERSATIONS: (Omit<
  TestConversation,
  "id"
> & { id: TestStructuredOutputKey })[] = [
  {
    id: "user-profile" as const,
    name: "Structured output - user profile",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage(
        "Extract the following user information: Name is John Doe, email is john@example.com, age is 30, and the account is active."
      ),
    ],
    expectedInResponses: [checkJsonResponse("user-profile")],
    configs: [
      {
        testStructuredOutputKey: "user-profile",
      },
    ],
  },
  {
    id: "data-extraction" as const,
    name: "Structured output - data extraction",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage(
        "Extract information from this document: 'Machine Learning Basics by Dr. Sarah Johnson, published January 15, 2024. This comprehensive guide covers neural networks, decision trees, and clustering algorithms.'"
      ),
    ],
    expectedInResponses: [checkJsonResponse("data-extraction")],
    configs: [
      {
        testStructuredOutputKey: "data-extraction",
      },
    ],
  },
] satisfies TestConversation[];

export type ConversationId =
  | (typeof TEST_CONVERSATIONS)[number]["id"]
  | (typeof TEST_VISION_CONVERSATIONS)[number]["id"]
  | (typeof TEST_STRUCTURED_OUTPUT_CONVERSATIONS)[number]["id"];

export const ALL_CONVERSATION_IDS: ConversationId[] = [
  ...TEST_CONVERSATIONS,
  ...TEST_VISION_CONVERSATIONS,
  ...TEST_STRUCTURED_OUTPUT_CONVERSATIONS,
].map((c) => c.id);

export function isConversationId(id: string): id is ConversationId {
  return ALL_CONVERSATION_IDS.some((existingId) => existingId === id);
}

export const runConversation = async (
  conversation: TestConversation,
  config: TestConfig
): Promise<void> => {
  const mockAuth = createMockAuthenticator();
  const llm = await getLLM(mockAuth, {
    modelId: config.modelId,
    temperature: config.temperature,
    reasoningEffort: config.reasoningEffort,
    responseFormat: config.testStructuredOutputKey
      ? JSON.stringify(TEST_RESPONSE_FORMATS[config.testStructuredOutputKey])
      : null,
    bypassFeatureFlag: true,
  });
  if (llm === null) {
    throw new Error("LLM instance is null");
  }

  const conversationHistory: ModelMessageTypeMultiActionsWithoutContentFragment[] =
    [];

  // Call the LLM
  for (const actionIndex in conversation.conversationActions) {
    const conversationAction = conversation.conversationActions[actionIndex];
    const expectedInResponse = conversation.expectedInResponses[actionIndex];

    conversationHistory.push(...conversationAction.messages);

    const events = llm.stream({
      conversation: { messages: conversationHistory },
      prompt: conversation.systemPrompt,
      specifications: conversation.specifications ?? [],
      forceToolCall: conversation.forceToolCall,
    });

    let responseFromDeltas = "";
    let fullResponse = "";
    let reasoningFromDeltas = "";
    let fullReasoning = "";
    let outputTokens: number | null = null;
    let totalTokens: number | null = null;
    const toolCalls: { name: string; arguments: Record<string, unknown> }[] =
      [];
    let toolCallId = 1;

    // Collect all events
    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
          responseFromDeltas += event.content.delta;
          break;
        case "text_generated":
          fullResponse = event.content.text;
          conversationHistory.push({
            role: "assistant",
            name: "Assistant",
            contents: [{ type: "text_content", value: event.content.text }],
          });
          break;
        case "reasoning_delta":
          reasoningFromDeltas += event.content.delta;
          break;
        case "reasoning_generated":
          fullReasoning = event.content.text;
          conversationHistory.push({
            role: "assistant",
            name: "Assistant",
            contents: [
              {
                type: "reasoning",
                value: {
                  reasoning: event.content.text,
                  metadata: JSON.stringify({
                    encrypted_content: event.metadata.encrypted_content,
                  }),
                  tokens: 12,
                  provider: config.provider,
                },
              },
            ],
          });
          break;
        case "token_usage":
          outputTokens = event.content.outputTokens ?? null;
          totalTokens = event.content.totalTokens ?? null;
          break;
        case "error":
          throw new Error(`LLM Error: ${event.content.message}`);
        case "tool_call":
          const metadata = event.metadata.thoughtSignature
            ? { thoughtSignature: event.metadata.thoughtSignature }
            : undefined;
          toolCalls.push({
            name: event.content.name,
            arguments: event.content.arguments,
          });
          conversationHistory.push({
            role: "assistant",
            name: "Assistant",
            contents: [
              {
                type: "function_call",
                value: {
                  // mistral only support ids of size 9
                  id: toolCallId.toString().padStart(9, "0"),
                  name: event.content.name,
                  arguments: JSON.stringify(event.content.arguments),
                  metadata,
                },
              },
            ],
          });
          toolCallId++;
          break;
      }
    }

    expect(fullResponse, "Full response should match deltas").toBe(
      responseFromDeltas
    );
    if (reasoningFromDeltas.length > 0) {
      // sometimes the final reasoning message is just a summary, so reasoning deltas
      // and end message may differ: we cannot just check equality
      expect(fullReasoning.length).toBeGreaterThan(0);
    }

    // Google answers 0 for short answers, so let's check that we got at least 1 total token
    if (outputTokens === 0) {
      expect(totalTokens).not.toBeNull();
      expect(totalTokens).toBeGreaterThan(0);
    } else {
      expect(outputTokens).not.toBeNull();
      expect(outputTokens).toBeGreaterThan(0);
    }

    if (expectedInResponse !== null) {
      switch (expectedInResponse.type) {
        case "text_contains":
          const expected = expectedInResponse.anyString.map((s) =>
            s.toLowerCase()
          );
          expect(
            expected.some((str) => fullResponse.toLowerCase().includes(str)),
            `Response should contain at least one of the expected substrings ${expected}`
          ).toBe(true);
          break;
        case "has_tool_call":
          const { toolName, expectedArguments } = expectedInResponse;
          const matchingToolCall = toolCalls.find(
            (tc) =>
              tc.name === toolName &&
              isDeepStrictEqual(tc.arguments, expectedArguments)
          );
          expect(matchingToolCall).toBeDefined();
          break;
        case "check_json_output":
          const fullResponseJson = safeParseJSON(fullResponse);
          assert(fullResponseJson.isOk());

          const schemaValidationResult = expectedInResponse.schema.safeParse(
            fullResponseJson.value
          );
          expect(schemaValidationResult.success).toBe(true);
          break;
        default:
          assertNever(expectedInResponse);
      }
    }
  }
};
