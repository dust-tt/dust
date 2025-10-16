import AnthropicClient from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { FinalModelConversationType } from "@app/lib/api/assistant/preprocessing";
import { conversationToAnthropicInput } from "@app/lib/llm/providers/anthropic/models/specTools";
import type { StreamEvent } from "@app/lib/llm/types";
import type { ModelIdType } from "@app/types";

import { LLM } from "../../../index";

export class Anthropic extends LLM {
  private anthropic: AnthropicClient;

  constructor({
    temperature,
    modelId,
  }: {
    temperature: number;
    modelId: ModelIdType;
  }) {
    super({
      temperature,
      model: modelId,
      provider: "anthropic",
    });
    this.anthropic = new AnthropicClient({
      apiKey: process.env.DUST_MANAGED_ANTHROPIC_API_KEY,
    });
  }

  protected conversationToModelInput({
    conversation,
    prompt,
  }: {
    conversation: FinalModelConversationType;
    prompt: string;
  }): { system: string; messages: AnthropicClient.MessageParam[] } {
    const { messages } = conversation;
    const result = [];

    const inputs = conversationToAnthropicInput({ messages });

    for (const input of inputs) {
      result.push(input);
    }

    return { system: prompt, messages: inputs };
  }

  protected specificationsToTools(
    specifications: AgentActionSpecification[]
  ): AnthropicClient.Tool[] {
    return specifications.map((spec) => ({
      name: spec.name,
      description: spec.description,
      input_schema: {
        type: "object" as const,
        ...spec.inputSchema,
      } as AnthropicClient.Tool["input_schema"],
    }));
  }

  async *streamResponse({
    conversation,
    prompt,
    step,
    specifications,
  }: {
    conversation: FinalModelConversationType;
    prompt: string;
    step: number;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<StreamEvent, void, unknown> {
    const { system, messages } = this.conversationToModelInput({
      conversation,
      prompt,
    });
    const tools = this.specificationsToTools(specifications);

    const input = {
      model: this.model,
      system,
      messages,
      // temperature: this.temperature,
      temperature: 1,
      max_tokens: 4096, // Add reasonable default
      stream: true,
      ...(tools.length > 0 && { tools }),
      thinking: {
        budget_tokens: 3000,
        type: "enabled" as const,
      },
    };

    // Write action stream events to JSON file
    const actionInputPath = path.join(
      process.cwd(),
      `lib/llm/providers/anthropic/models/logs/input_${step}.json`
    );
    fs.writeFileSync(actionInputPath, JSON.stringify(input, null, 2));

    const stream = await this.anthropic.messages.stream(input);

    const anthropicResponse = [];

    for await (const chunk of stream) {
      anthropicResponse.push(chunk);
      // Transform Anthropic stream chunks to match expected output format

      const streamEvent = this.modelOutputToStreamEvent(chunk);
      if (streamEvent) {
        yield streamEvent;
      }
    }
  }

  protected modelOutputToStreamEvent(
    event: AnthropicClient.MessageStreamEvent
  ): StreamEvent | null {
    switch (event.type) {
      case "message_start":
        // Ignore - used for initialization
        return null;

      case "message_delta":
        // Handle message status updates
        return null;

      case "content_block_start":
        // Handle content block start (e.g., text, tool_use)
        if (event.content_block.type === "tool_use") {
          return {
            type: "function_call",
            content: {
              name: event.content_block.name,
            },
          };
        }
        return null;

      case "content_block_delta":
        // Handle text deltas
        if (event.delta.type === "text_delta") {
          return {
            type: "tokens",
            content: {
              tokens: {
                text: event.delta.text,
              },
            },
          };
        }
        // Handle tool use input deltas
        if (event.delta.type === "input_json_delta") {
          // For now, we ignore partial JSON updates
          return null;
        }
        return null;

      case "content_block_stop":
        // Handle content block completion
        return null;

      case "message_stop":
        // Handle message completion - for Anthropic, the final message is available on the stream's finalMessage
        // For now, we create a basic completion event
        return {
          type: "response_completed",
          content: {
            response: {
              id: "anthropic-stream-end",
              status: "completed" as const,
              model: this.model,
              output: [
                {
                  type: "message" as const,
                  status: "completed" as const,
                  content: [
                    {
                      type: "text",
                      text: "", // Text accumulation is handled in delta events
                    },
                  ],
                  role: "assistant" as const,
                },
              ],
              usage: undefined, // Usage stats not available in this event
            },
          },
        };

      default:
        // Ignore unhandled event types
        return null;
    }
  }
}
