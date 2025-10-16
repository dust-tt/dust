import { Mistral } from "@mistralai/mistralai";
import { responseFormatFromZodObject as _responseFormatFromZodObject } from "@mistralai/mistralai/extra/structChat";
import type { Messages, Tool } from "@mistralai/mistralai/models/components";
import z from "zod";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { FinalModelConversationType } from "@app/lib/api/assistant/preprocessing";
import { conversationToMistralInput } from "@app/lib/llm/providers/mistral/models/specTools";
import type { StreamEvent } from "@app/lib/llm/types";
import type { ModelId } from "@app/types";

import { LLM } from "../../../index";

export class MistralLLM extends LLM {
  private mistral: Mistral;

  constructor({
    temperature,
    modelId: _modelId,
  }: {
    temperature: number;
    modelId?: ModelId;
  }) {
    super({
      temperature,
      model: "mistral-large-latest",
      // model: "magistral-medium-2509",
      provider: "mistral",
    });
    this.mistral = new Mistral({
      apiKey: process.env.DUST_MANAGED_MISTRAL_API_KEY,
    });
  }

  protected conversationToModelInput({
    conversation,
    prompt,
  }: {
    conversation: FinalModelConversationType;
    prompt: string;
  }): Messages[] {
    const { messages } = conversation;
    const result: Messages[] = [{ role: "system" as const, content: prompt }];

    const inputs = conversationToMistralInput({ messages });

    for (const input of inputs) {
      result.push(input);
    }

    return result;
  }

  protected specificationsToTools(
    specifications: AgentActionSpecification[]
  ): Tool[] {
    return specifications.map((spec) => ({
      type: "function" as const,
      function: {
        name: spec.name,
        description: spec.description,
        parameters: spec.inputSchema as Record<string, unknown>,
      },
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
    const messages = this.conversationToModelInput({ conversation, prompt });
    const tools = this.specificationsToTools(specifications);

    const _WeatherResponse = z.object({
      city: z.string(),
      date: z.string(),
      forecast: z.string(),
    });

    const WeatherResponseJsonSchema = {
      name: "WeatherResponse",
      schemaDefinition: {
        type: "object",
        properties: {
          city: {
            type: "string",
          },
          date: {
            type: "string",
          },
          forecast: {
            type: "string",
          },
        },
        required: ["city", "date", "forecast"],
        additionalProperties: false,
      },
    };

    const input = {
      model: this.model,
      messages,
      stream: true,
      temperature: this.temperature,
      ...(tools.length > 0 && { tools }),
      // promptMode: "reasoning" as const,
      responseFormat: {
        type: "json_schema" as const,
        jsonSchema: WeatherResponseJsonSchema,
      },
    };

    const response = await this.mistral.chat.stream(input);

    const mistralResponse = [];

    for await (const chunk of response) {
      mistralResponse.push(chunk);

      const streamEvent = this.modelOutputToStreamEvent(chunk);
      if (streamEvent) {
        yield streamEvent;
      }
    }
  }

  protected modelOutputToStreamEvent(chunk: any): StreamEvent | null {
    if (!chunk.choices || chunk.choices.length === 0) {
      return null;
    }

    const choice = chunk.choices[0];
    const delta = choice.delta;

    if (delta?.content) {
      return {
        type: "tokens",
        content: {
          tokens: {
            text: delta.content,
          },
        },
      };
    }

    // Handle tool calls
    if (delta?.toolCalls && delta.toolCalls.length > 0) {
      const toolCall = delta.toolCalls[0];
      if (toolCall?.function?.name) {
        return {
          type: "function_call",
          content: {
            name: toolCall.function.name,
          },
        };
      }
    }

    // Handle completion
    if (
      choice.finish_reason === "stop" ||
      choice.finish_reason === "length" ||
      choice.finish_reason === "tool_calls"
    ) {
      return {
        type: "response_completed",
        content: {
          response: {
            id: chunk.id || "unknown",
            status: "completed" as const,
            model: chunk.model || this.model,
            output: [
              {
                type: "message" as const,
                status: "completed" as const,
                content: [
                  {
                    type: "text" as const,
                    text: "", // Content was already streamed
                  },
                ],
                role: "assistant" as const,
              },
            ],
            usage: chunk.usage
              ? {
                  input_tokens: chunk.usage.prompt_tokens || 0,
                  output_tokens: chunk.usage.completion_tokens || 0,
                  total_tokens: chunk.usage.total_tokens || 0,
                }
              : undefined,
          },
        },
      };
    }

    return null;
  }
}
