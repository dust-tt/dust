import clone from "lodash/clone";
import { describe, expect, it } from "vitest";

import { Client } from "@/client";
import type { StreamInput } from "@/types/client";
import type { InputConfig } from "@/types/config";
import type { Conversation } from "@/types/history";
import type { FinishEvent, WithMetadataStreamEvent } from "@/types/output";
import { OPENAI_PROVIDER_ID } from "../types";
import { GPT_5_2_2025_12_11_MODEL_ID } from "./gpt-5.2-2025-12-11";

type TestCase = {
  config: InputConfig;
  conversation: Conversation;
  expect: FinishEvent;
};

const capitalConversation: Conversation = {
  messages: [
    {
      role: "user",
      type: "text",
      content: { value: "What is the capital of France?" },
    },
  ],
  system: [
    {
      role: "system",
      type: "text",
      content: { value: "You are a helpful assistant." },
    },
  ],
};

const capitalExpectation: FinishEvent = {
  type: "completion",
  content: {
    value: expect.arrayContaining([
      expect.objectContaining({ type: "text_generated" }),
    ]),
  },
};

const testCases = {
  "Empty config": {
    config: {
      tools: [],
    },
    conversation: capitalConversation,
    expect: capitalExpectation,
  },
  "With reasoning": {
    config: {
      maxOutputTokens: 100,
      reasoningEffort: "medium",
      reasoningDetailsLevel: "high",
      tools: [
        {
          name: "calculator",
          description: "A tool for performing calculations.",
          inputSchema: {
            type: "object",
            properties: {
              expression: { type: "string" },
            },
            required: ["expression"],
          },
        },
      ],
    },
    conversation: capitalConversation,
    expect: capitalExpectation,
  },
  "With temperature": {
    config: {
      temperature: 0.7,
      maxOutputTokens: 100,
      reasoningEffort: "none",
      topProbability: 0.9,
      topLogprobs: 5,
      tools: [],
    },
    conversation: capitalConversation,
    expect: capitalExpectation,
  },
} satisfies Record<string, TestCase>;

const PROVIDER_ID = OPENAI_PROVIDER_ID;
const MODEL_ID = GPT_5_2_2025_12_11_MODEL_ID;

const client = new Client({
  providerId: PROVIDER_ID,
  config: { apiKey: process.env.DUST_MANAGED_API_KEY || "" },
});

const runTestCase = async (
  input: Omit<StreamInput, "modelId">,
  expected: FinishEvent
) => {
  const stream = await client.stream({
    modelId: MODEL_ID,
    config: input.config,
    payload: input.payload,
  });

  let lastEvent: WithMetadataStreamEvent | null = null;
  for await (const event of stream) {
    lastEvent = event;
  }

  expect(lastEvent).not.toBeNull();
  expect(lastEvent).toMatchObject(expected);
};

describe("Test Cases", () => {
  it.each(
    Object.entries(clone(testCases))
  )("%s", async (_testName, testCase) => {
    await runTestCase(
      {
        config: testCase.config,
        payload: { conversation: testCase.conversation },
      },
      testCase.expect
    );
  });
});
