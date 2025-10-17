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
  LLMEvent,
  LLMOutputItem,
  ProviderMetadata,
} from "@app/lib/llm/types";
import type { ModelConfigurationType, ModelConversationTypeMultiActions } from "@app/types";
import type { Content } from "@app/types/assistant/generation";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private metadata: ProviderMetadata = {
    providerId: "anthropic",
    modelId: this.model.modelId,
  };
  protected temperature: number;
  constructor({
    model,
    temperature,
  }: {
    temperature: number;
    model: ModelConfigurationType;
  }) {
    super(model);
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.temperature = temperature;
  }

  async *stream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMEvent> {
    let items: LLMOutputItem[] = [];
    const anthropicConversation = this.toAnthropicConversation(conversation);
    const eventStream = await this.client.messages.stream({
      model: this.model.modelId,
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
                content: {
                  delta: event.delta.text,
                },
                metadata: this.metadata,
              };
              break;
            case "thinking_delta":
              yield {
                type: "reasoning_delta",
                content: {
                  delta: event.delta.thinking,
                },
                metadata: this.metadata,
              };
              break;
            default:
              continue;
          }
          break;
        case "message_start":
          this.metadata.messageId = event.message.id;
          items = this.fromAnthropicContent(event.message.content);
          break;
        case "message_stop":
          for (const item of items) {
            if (item.type === "tool_call") {
              yield {
                type: "tool_call",
                content: item.content,
                metadata: this.metadata,
              };
            }
          }
          yield {
            type: "success",
            content: items,
            metadata: this.metadata,
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
            content: {
              text: item.text,
            },
            metadata: this.metadata,
          });
          break;
        case "thinking":
          items.push({
            type: "reasoning_generated",
            content: {
              text: item.thinking,
            },
            metadata: this.metadata,
          });
          break;
        case "tool_use":
          items.push({
            type: "tool_call",
            content: {
              id: item.id,
              name: item.name,
              arguments: JSON.stringify(item.input),
            },
            metadata: this.metadata,
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
    conversation: ModelConversationTypeMultiActions
  ): MessageParam[] {
    const messages: MessageParam[] = [];
    for (const message of conversation.messages) {
        if (message.role === "content_fragment") {
            continue;
        }
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
