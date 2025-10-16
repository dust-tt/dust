import { OpenAI } from "openai";
import type {
  ResponseInputContent,
  ResponseInputItem,
} from "openai/resources/responses/responses.mjs";

import { LLM } from "@app/lib/llm/llm";
import type { LLMStreamEvent, ProviderMetadata } from "@app/lib/llm/types";
import type {
  Content,
  RenderedModelConversationTypeMultiActions,
} from "@app/types";

export class OpenAILLM extends LLM {
  private client: OpenAI;
  private baseMetadata: ProviderMetadata<"openai"> = {
    provider: "openai",
    model: this.modelId,
    metadata: {},
  };

  constructor({
    temperature,
    modelId,
  }: {
    temperature: number;
    modelId: string;
  }) {
    super({ temperature, modelId, providerId: "openai" });
    this.client = new OpenAI({
      apiKey: process.env.DUST_MANAGED_OPENAI_API_KEY,
    });
  }

  async *stream({
    conversation,
    prompt,
  }: {
    conversation: RenderedModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMStreamEvent> {
    const openaiConversation = this.toOpenAIChatConversation({
      prompt,
      conversation,
    });
    const eventStream = await this.client.responses.stream({
      model: this.modelId,
      input: openaiConversation,
      temperature: this.temperature,
      stream: true,
    });
    for await (const event of eventStream) {
      switch (event.type) {
        case "response.output_text.delta":
          yield {
            type: "text_delta",
            delta: event.delta,
            metadata: this.baseMetadata,
          };
          break;
        case "response.output_text.done":
          yield {
            type: "success",
            items: [
              {
                type: "text_generated",
                text: event.text,
                metadata: this.baseMetadata,
              },
            ],
            metadata: this.baseMetadata,
          };
          break;
        case "response.output_item.done":
          if (event.item.type === "function_call") {
            yield {
              type: "tool_call",
              toolCall: {
                id: event.item.call_id,
                name: event.item.name,
                arguments: event.item.arguments,
              },
              metadata: this.baseMetadata,
            };
          }
          break;
        case "response.reasoning_summary_text.delta":
          yield {
            type: "reasoning_delta",
            delta: event.delta,
            metadata: this.baseMetadata,
          };
          break;
        default:
          continue;
      }
    }
  }

  private toOpenAIChatContent(content: Content[]): ResponseInputContent[] {
    const contents: ResponseInputContent[] = [];
    for (const contentItem of content) {
      switch (contentItem.type) {
        case "text":
          contents.push({
            type: "input_text",
            text: contentItem.text,
          });
          break;
        case "image_url":
          contents.push({
            type: "input_image",
            detail: "auto",
            image_url: contentItem.image_url.url,
          });
          break;
        default:
          continue;
      }
    }
    return contents;
  }

  private toOpenAIChatConversation({
    prompt,
    conversation,
  }: {
    prompt: string;
    conversation: RenderedModelConversationTypeMultiActions;
  }): ResponseInputItem[] {
    const messages: ResponseInputItem[] = [];
    messages.push({
      type: "message",
      role: "developer",
      content: prompt,
    });
    for (const message of conversation.messages) {
      let content: ResponseInputContent[] | string;
      if (typeof message.content === "string") {
        content = message.content;
      } else if (message.content) {
        content = this.toOpenAIChatContent(message.content);
      } else {
        continue;
      }
      if (message.role === "function") {
        messages.push({
          type: "function_call",
          name: message.name,
          arguments: JSON.stringify(message.content),
          call_id: message.function_call_id,
        });
      } else {
        messages.push({
          type: "message",
          role: message.role,
          content: content,
        });
      }
    }
    return messages;
  }
}
