import { describe, expect, it } from "vitest";

import { Client } from "@/client";
import { GPT_5_2_2025_12_11_MODEL_ID } from "@/providers/openai/models/gpt-5.2-2025-12-11.js";
import { OPENAI_PROVIDER_ID } from "../types";

const MODEL_ID = GPT_5_2_2025_12_11_MODEL_ID;
const PROVIDER_ID = OPENAI_PROVIDER_ID;

describe(`${PROVIDER_ID} / ${MODEL_ID}`, () => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set. Create a .env file with your API key."
    );
  }

  const client = new Client({ providerId: PROVIDER_ID, config: { apiKey } });

  it("should stream with no input config", async () => {
    const stream = client.stream(
      MODEL_ID,
      {
        conversation: {
          messages: [
            {
              role: "user",
              type: "text",
              content: { value: "What is 2+2?" },
            },
          ],
          system: [
            {
              role: "system",
              type: "text",
              content: { value: "You are a helpful assistant." },
            },
          ],
        },
      },
      {}
    );

    let foundCompletion = false;

    for await (const event of stream) {
      if (event.type === "completion") {
        expect(event).toEqual({
          type: "completion",
          content: {
            value: expect.arrayContaining([
              expect.objectContaining({ type: "text_generated" }),
            ]),
          },
          metadata: {
            modelId: GPT_5_2_2025_12_11_MODEL_ID,
            providerId: OPENAI_PROVIDER_ID,
            completedAt: expect.any(Number),
            createdAt: expect.any(Number),
            responseId: expect.any(String),
          },
        });
        foundCompletion = true;
      }
    }

    expect(foundCompletion).toBe(true);
  }, 30000);

  it("should stream with temperature=0.7, reasoningEffort=none, topProbability=0.9, topLogprobs=10", async () => {
    const stream = client.stream(
      GPT_5_2_2025_12_11_MODEL_ID,
      {
        conversation: {
          messages: [
            {
              role: "user",
              type: "text",
              content: { value: "Name a color." },
            },
          ],
        },
        systemPrompt: {
          value: "You are a helpful assistant.",
        },
      },
      {
        temperature: 0.7,
        reasoningEffort: "none",
        topProbability: 0.9,
        topLogprobs: 10,
      }
    );

    let foundCompletion = false;

    for await (const event of stream) {
      if (event.type === "completion") {
        expect(event).toEqual({
          type: "completion",
          content: {
            value: expect.arrayContaining([
              expect.objectContaining({ type: "text_generated" }),
            ]),
          },
          metadata: {
            modelId: GPT_5_2_2025_12_11_MODEL_ID,
            providerId: OPENAI_PROVIDER_ID,
            completedAt: expect.any(Number),
            createdAt: expect.any(Number),
            responseId: expect.any(String),
          },
        });
        foundCompletion = true;
      }
    }

    expect(foundCompletion).toBe(true);
  }, 30000);

  it("should stream with reasoningEffort=medium, reasoningDetailsLevel=high, maxOutputTokens=500", async () => {
    const stream = client.stream(
      GPT_5_2_2025_12_11_MODEL_ID,
      {
        conversation: {
          messages: [
            {
              role: "user",
              type: "text",
              content: { value: "Explain quantum computing briefly." },
            },
          ],
        },
        systemPrompt: {
          value: "You are a helpful assistant.",
        },
      },
      {
        reasoningEffort: "medium",
        reasoningDetailsLevel: "high",
        maxOutputTokens: 500,
      }
    );

    let foundCompletion = false;

    for await (const event of stream) {
      if (event.type === "completion") {
        expect(event).toEqual({
          type: "completion",
          content: {
            value: expect.arrayContaining([
              expect.objectContaining({ type: "text_generated" }),
            ]),
          },
          metadata: {
            modelId: GPT_5_2_2025_12_11_MODEL_ID,
            providerId: OPENAI_PROVIDER_ID,
            completedAt: expect.any(Number),
            createdAt: expect.any(Number),
            responseId: expect.any(String),
          },
        });
        foundCompletion = true;
      }
    }

    expect(foundCompletion).toBe(true);
  }, 30000);

  it("should stream with reasoningEffort=high, reasoningDetailsLevel=low, maxOutputTokens=1000", async () => {
    const stream = client.stream(
      GPT_5_2_2025_12_11_MODEL_ID,
      {
        conversation: {
          messages: [
            {
              role: "user",
              type: "text",
              content: {
                value: "What are the benefits of renewable energy?",
              },
            },
          ],
        },
        systemPrompt: {
          value: "You are a helpful assistant.",
        },
      },
      {
        reasoningEffort: "high",
        reasoningDetailsLevel: "low",
        maxOutputTokens: 1000,
      }
    );

    let foundCompletion = false;

    for await (const event of stream) {
      if (event.type === "completion") {
        expect(event).toEqual({
          type: "completion",
          content: {
            value: expect.arrayContaining([
              expect.objectContaining({ type: "text_generated" }),
            ]),
          },
          metadata: {
            modelId: GPT_5_2_2025_12_11_MODEL_ID,
            providerId: OPENAI_PROVIDER_ID,
            completedAt: expect.any(Number),
            createdAt: expect.any(Number),
            responseId: expect.any(String),
          },
        });
        foundCompletion = true;
      }
    }

    expect(foundCompletion).toBe(true);
  }, 30000);

  it("should stream with tool call - get_weather function", async () => {
    const stream = client.stream(
      GPT_5_2_2025_12_11_MODEL_ID,
      {
        conversation: {
          messages: [
            {
              role: "user",
              type: "text",
              content: { value: "What's the weather in Paris?" },
            },
          ],
        },
        systemPrompt: {
          value:
            "You are a helpful assistant with access to weather information.",
        },
      },
      {
        temperature: 0.5,
        tools: [
          {
            name: "get_weather",
            description: "Get the current weather in a given location",
            inputSchema: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "The city and country, e.g. Paris, France",
                },
              },
              required: ["location"],
            },
          },
        ],
      }
    );

    let foundToolCall = false;

    for await (const event of stream) {
      if (event.type === "completion") {
        const hasToolCall = event.content.value.some(
          (item) => item.type === "tool_call_request"
        );
        if (hasToolCall) {
          foundToolCall = true;
        }
        expect(event).toEqual({
          type: "completion",
          content: {
            value: expect.any(Array),
          },
          metadata: {
            modelId: GPT_5_2_2025_12_11_MODEL_ID,
            providerId: OPENAI_PROVIDER_ID,
            completedAt: expect.any(Number),
            createdAt: expect.any(Number),
            responseId: expect.any(String),
          },
        });
      }
    }

    expect(foundToolCall).toBe(true);
  }, 30000);
});
