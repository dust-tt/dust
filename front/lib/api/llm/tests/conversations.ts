import { expect } from "vitest";

import { getLLM } from "@app/lib/api/llm";
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
import { assertNever } from "@app/types";

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

function containsTextChecker(substring: string): ResponseChecker {
  return {
    type: "text_contains",
    substring,
  };
}

function hasToolCall(
  toolName: string,
  expectedArguments: string
): ResponseChecker {
  return {
    type: "has_tool_call",
    toolName,
    expectedArguments,
  };
}

export const TEST_CONVERSATIONS: TestConversation[] = [
  {
    id: "simple-math",
    name: "Simple Math",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Be concise. What is 2+2? Just give the number."),
    ],
    expectedInResponses: [containsTextChecker("4")],
  },
  {
    id: "yes-no-question",
    name: "Yes/No Question",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Answer only yes or no. Is Paris the capital of France?"),
    ],
    expectedInResponses: [containsTextChecker("yes")],
  },
  {
    id: "multi-step-conversation",
    name: "2 steps conversation",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("Be very brief. Hello my name is Stan ! How are you?"),
      userMessage("What is my name ?"),
    ],
    expectedInResponses: [null, containsTextChecker("Stan")],
  },
  {
    id: "tool-usage",
    name: "Tool usage required",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessage("What is the id of Stan?"),
      userToolCall("GetUserId", "88888"),
    ],
    expectedInResponses: [
      hasToolCall("GetUserId", "Stan"),
      containsTextChecker("88888"),
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
    id: "image-description",
    name: "Image description",
    systemPrompt: SYSTEM_PROMPT,
    conversationActions: [
      userMessageWithImage(
        "Describe this image.",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/481px-Cat03.jpg"
      ),
    ],
    expectedInResponses: [containsTextChecker("cat")],
  },
];

export const runConversation = async (
  conversation: TestConversation,
  config: TestConfig
): Promise<void> => {
  const mockAuth = createMockAuthenticator();
  const llm = await getLLM(mockAuth, {
    modelId: config.modelId,
    temperature: config.temperature,
    reasoningEffort: config.reasoningEffort,
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
    });

    let responseFromDeltas = "";
    let fullResponse = "";
    let reasoningFromDeltas = "";
    let fullReasoning = "";
    let outputTokens: number | null = null;
    const toolCalls: { name: string; arguments: string }[] = [];
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
          const signature = event.metadata.signature ?? "";
          conversationHistory.push({
            role: "assistant",
            name: "Assistant",
            contents: [
              {
                type: "reasoning",
                value: {
                  reasoning: event.content.text,
                  metadata: JSON.stringify({ signature: signature }),
                  tokens: 12,
                  provider: config.provider,
                },
              },
            ],
          });
          break;
        case "token_usage":
          outputTokens = event.content.outputTokens;
          break;
        case "error":
          throw new Error(`LLM Error: ${event.content.message}`);
        case "tool_call":
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
                  arguments: event.content.arguments,
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
    expect(fullReasoning, "Full reasoning should match deltas").toBe(
      reasoningFromDeltas
    );
    expect(outputTokens).not.toBeNull();
    expect(outputTokens).toBeGreaterThan(0);

    if (expectedInResponse !== null) {
      switch (expectedInResponse.type) {
        case "text_contains":
          expect(fullResponse.toLowerCase()).toContain(
            expectedInResponse.substring.toLowerCase()
          );
          break;
        case "has_tool_call":
          const { toolName, expectedArguments } = expectedInResponse;
          const matchingToolCall = toolCalls.find(
            (tc) =>
              tc.name === toolName && tc.arguments.includes(expectedArguments)
          );
          expect(matchingToolCall).toBeDefined();
          break;
        default:
          assertNever(expectedInResponse);
      }
    }
  }
};
