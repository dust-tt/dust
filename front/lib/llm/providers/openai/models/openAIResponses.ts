import fs from "fs";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Responses } from "openai/resources/index";
import path from "path";
import z from "zod";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { FinalModelConversationType } from "@app/lib/api/assistant/preprocessing";
import { conversationToOpenAIInput } from "@app/lib/llm/providers/openai/models/specTools";
import type { StreamEvent } from "@app/lib/llm/types";
import logger from "@app/logger/logger";
import type { ModelIdType } from "@app/types";

import { LLM } from "../../../index";

export class OpenAIResponses extends LLM {
  private openai: OpenAI;

  constructor({
    temperature,
    model,
  }: {
    temperature: number;
    model?: ModelIdType;
  }) {
    super({
      temperature,
      model: model ?? "gpt-4.1-2025-04-14",
      provider: "openai",
    });
    // TODO: Get API key from environment or configuration
    this.openai = new OpenAI({
      apiKey: process.env.DUST_MANAGED_OPENAI_API_KEY,
    });
  }

  protected conversationToModelInput({
    conversation,
    prompt,
  }: {
    conversation: FinalModelConversationType;
    prompt: string;
  }): Responses.ResponseInput {
    const { messages } = conversation;
    const result: Responses.ResponseInput = [
      { type: "message" as const, role: "system" as const, content: prompt },
    ];

    const inputs = conversationToOpenAIInput({ messages });

    for (const input of inputs) {
      result.push(input);
    }

    return result;
  }

  protected specificationsToTools(
    specifications: AgentActionSpecification[]
  ): OpenAI.Responses.Tool[] {
    return specifications.map((spec) => ({
      type: "function" as const,
      name: spec.name,
      description: spec.description,
      parameters: spec.inputSchema as Record<string, unknown>,
      strict: false,
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
    const convInput = this.conversationToModelInput({ conversation, prompt });
    const tools = this.specificationsToTools(specifications);

    const input = {
      model: this.model,
      input: convInput,
      ...(["o3", "gpt-5"].includes(this.model)
        ? {}
        : { temperature: this.temperature }),
      ...(["o3", "gpt-5"].includes(this.model)
        ? {
            reasoning: {
              effort: "high",
              summary: "auto",
            },
          }
        : {}),
      store: false,
      stream: true,
      ...(tools.length > 0 && { tools }),
    };

    const WeatherResponse = z.object({
      city: z.string(),
      date: z.string(),
      forecast: z.string(),
    });

    const response = await this.openai.responses.create({
      model: this.model,
      input: convInput,
      // ...(["o3", "gpt-5"].includes(this.model)
      //   ? {}
      //   : { temperature: this.temperature }),
      // ...(["o3", "gpt-5"].includes(this.model)
      //   ? {
      //       reasoning: {
      //         effort: "high",
      //         summary: "auto",
      //       },
      //     }
      //   : {}),
      store: false,
      stream: true,
      ...(tools.length > 0 && { tools }),
      text: {
        format: zodTextFormat(WeatherResponse, "event"),
      },
    });

    const gpt4Response = [];

    for await (const chunk of response) {
      gpt4Response.push(chunk);
      // Transform OpenAI Response API chunks to match expected output format

      const streamEvent = this.modelOutputToStreamEvent(chunk);
      if (streamEvent) {
        yield streamEvent;
      }
    }
  }

  protected modelOutputToStreamEvent(
    event: Responses.ResponseStreamEvent
  ): StreamEvent | null {
    switch (event.type) {
      case "response.created":
        // Ignore - used for initialization
        return null;

      case "response.in_progress":
        // Ignore - status update
        return null;

      case "response.output_item.added":
        // Handle function call item addition
        if (
          "item" in event &&
          event.item &&
          event.item.type === "function_call" &&
          "name" in event.item
        ) {
          return {
            type: "function_call",
            content: {
              name: event.item.name,
            },
          };
        }
        return null;

      case "response.output_item.done":
        // Handle reasoning item completion
        if ("item" in event && event.item && event.item.type === "reasoning") {
          // For reasoning items, we create metadata from available information
          const metadata = JSON.stringify({
            id: event.item.id,
            // Note: encrypted_content is not available in the public types
            // but we handle the case where it might be available at runtime
          });
          return {
            type: "reasoning_item",
            content: {
              metadata,
            },
          };
        }
        return null;

      case "response.output_text.delta":
        if ("delta" in event && event.delta) {
          return {
            type: "tokens",
            content: {
              tokens: {
                text: event.delta,
              },
            },
          };
        }
        return null;

      case "response.reasoning_summary_text.delta":
        if ("delta" in event && event.delta) {
          return {
            type: "reasoning_tokens",
            content: {
              tokens: {
                text: event.delta,
              },
            },
          };
        }
        return null;

      case "response.reasoning_summary_text.done":
        return {
          type: "reasoning_tokens",
          content: {
            tokens: {
              text: "\n\n",
            },
          },
        };

      case "response.completed": {
        return {
          type: "response_completed",
          content: {
            response: {
              id: event.response.id,
              status: "completed" as const,
              model: event.response.model,
              output: event.response.output.map((item) => ({
                // id: item.id,
                type: item.type,
                status: "completed" as const,
                content:
                  item.type === "message"
                    ? item.content.map((content) => ({
                        type: content.type,
                        text:
                          content.type === "output_text"
                            ? content.text
                            : undefined,
                      }))
                    : [],
                role: "assistant" as const,
              })),
              usage: event.response.usage
                ? {
                    input_tokens: event.response.usage.input_tokens,
                    output_tokens: event.response.usage.output_tokens,
                    total_tokens: event.response.usage.total_tokens,
                  }
                : undefined,
            },
          },
        };
      }

      case "response.failed":
      case "response.incomplete":
        // Error handling - these are handled by OpenAI client
        return null;

      // Ignored events (as per Rust implementation)
      case "response.reasoning_summary_part.added":
      case "response.reasoning_summary_part.done":
      case "response.content_part.added":
      case "response.output_text.done":
      case "response.content_part.done":
      case "response.function_call_arguments.delta":
      case "response.function_call_arguments.done":
      case "response.audio.delta":
      case "response.audio.done":
      case "response.audio.transcript.delta":
      case "response.audio.transcript.done":
      case "response.code_interpreter_call.code.delta":
      case "response.code_interpreter_call.code.done":
      case "error":
        // Ignore these events as per Rust implementation
        return null;

      default:
        // Ignore unhandled event types
        return null;
    }
  }
}
