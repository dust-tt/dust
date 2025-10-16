import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  ContentBlockParam,
  ImageBlockParam,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import { LLM } from "@app/lib/llm/llm";
import type {
  LLMOutputItem,
  LLMStreamEvent,
  ProviderMetadata,
} from "@app/lib/llm/types";
import type { RenderedModelConversationTypeMultiActions } from "@app/types";
import type { Content } from "@app/types/assistant/generation";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private baseMetadata: ProviderMetadata<"anthropic"> = {
    provider: "anthropic",
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
    super({ temperature, modelId, providerId: "anthropic" });
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async *stream({
    conversation,
    prompt,
  }: {
    conversation: RenderedModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMStreamEvent> {
    let items: LLMOutputItem[] = [];
    const anthropicConversation = this.toAnthropicConversation(conversation);
    const eventStream = await this.client.messages.stream({
      model: this.modelId,
      thinking: {
        type: "enabled",
        budget_tokens: 16000,
      },
      system: prompt,
      messages: anthropicConversation,
      temperature: this.temperature,
      stream: true,
      max_tokens: 64000,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "content_block_delta":
          switch (event.delta.type) {
            case "text_delta":
              yield {
                type: "text_delta",
                delta: event.delta.text,
                metadata: this.baseMetadata,
              };
              break;
            case "thinking_delta":
              yield {
                type: "reasoning_delta",
                delta: event.delta.thinking,
                metadata: this.baseMetadata,
              };
              break;
            default:
              continue;
          }
          break;
        case "message_start":
          this.baseMetadata.metadata = {
            messageId: event.message.id,
          };
          items = this.fromAnthropicContent(event.message.content);
          break;
        case "message_stop":
          for (const item of items) {
            if (item.type === "tool_call") {
              yield {
                type: "tool_call",
                toolCall: item.toolCall,
                metadata: this.baseMetadata,
              };
            }
          }
          yield {
            type: "success",
            items,
            metadata: this.baseMetadata,
          };
          break;
        default:
          continue;
      }
    }
  }

  private fromAnthropicContent(content: ContentBlock[]): LLMOutputItem[] {
    const items: LLMOutputItem[] = [];
    for (const item of content) {
      switch (item.type) {
        case "text":
          items.push({
            type: "text_generated",
            text: item.text,
            metadata: this.baseMetadata,
          });
          break;
        case "thinking":
          items.push({
            type: "reasoning_generated",
            reasoning: item.thinking,
            metadata: this.baseMetadata,
          });
          break;
        case "tool_use":
          items.push({
            type: "tool_call",
            toolCall: {
              id: item.id,
              name: item.name,
              arguments: JSON.stringify(item.input),
            },
            metadata: this.baseMetadata,
          });
          break;
      }
    }
    return items;
  }

  private toAnthropicContent(input: Content[]): ContentBlockParam[] {
    const content: ContentBlockParam[] = [];
    for (const contentItem of input) {
      switch (contentItem.type) {
        case "text":
          content.push({
            type: "text",
            text: contentItem.text,
          });
          break;
        case "image_url":
          content.push({
            type: "image",
            source: {
              type: "url",
              url: contentItem.image_url.url,
            },
          });
          break;
        default:
          continue;
      }
    }
    return content;
  }

  private toAnthropicConversation(
    conversation: RenderedModelConversationTypeMultiActions
  ): MessageParam[] {
    const messages: MessageParam[] = [];
    for (const message of conversation.messages) {
      if (message.role === "function") {
        if (typeof message.content === "string") {
          messages.push({
            role: "assistant",
            content: [
              {
                type: "tool_result",
                tool_use_id: message.function_call_id,
                content: message.content,
              },
            ],
          });
        } else if (message.content) {
          messages.push({
            role: "assistant",
            content: [
              {
                type: "tool_result",
                tool_use_id: message.function_call_id,
                content: this.toAnthropicContent(message.content) as (
                  | TextBlockParam
                  | ImageBlockParam
                )[],
              },
            ],
          });
        } else {
          continue;
        }
      } else {
        if (typeof message.content === "string") {
          messages.push({
            role: message.role,
            content: message.content,
          });
        } else if (message.content) {
          messages.push({
            role: message.role,
            content: this.toAnthropicContent(message.content),
          });
        } else {
          continue;
        }
      }
    }
    return messages;
  }
}
