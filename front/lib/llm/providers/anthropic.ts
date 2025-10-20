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
  ReasoningDeltaEvent,
  TextDeltaEvent,
} from "@app/lib/llm/types";
import type { ModelConfigurationType, ModelConversationTypeMultiActions } from "@app/types";
import type { Content } from "@app/types/assistant/generation";

export class AnthropicLLM extends LLM {
  private client: Anthropic;
  private metadata: ProviderMetadata = {
    providerId: "anthropic",
    modelId: this.model.modelId,
  };
  private itemsAccumulator: LLMOutputItem[] = [];
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

  private resetAccumulators(): void {
    this.itemsAccumulator = [];
  }

  async *stream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMEvent> {
    this.resetAccumulators();
    const messages = this.getMessages(conversation);
    const events = await this.client.messages.stream({
      model: this.model.modelId,
      thinking: {
        type: "enabled",
        budget_tokens: 16000,
      },
      system: prompt,
      messages,
      temperature: this.temperature,
      stream: true,
      max_tokens: 64000,
    });

    for await (const event of events) {
      switch (event.type) {
        case "content_block_delta":
          switch (event.delta.type) {
            case "text_delta":
              yield this.textDelta(event.delta.text);
              break;
            case "thinking_delta":
                yield this.reasoningDelta(event.delta.thinking);
              break;
            default:
              continue;
          }
          break;
        case "message_start":
          this.metadata.messageId = event.message.id;
          yield* this.streamAnthropicContent(event.message.content);
          break;
        case "message_stop":
          yield* this.yieldFinalEvents();
          break;
        default:
          continue;
      }
    }
  }

  private textDelta(delta: string): TextDeltaEvent {
    return {
      type: "text_delta",
      content: {
        delta,
      },
      metadata: this.metadata,
    };
  }

  private reasoningDelta(delta: string): ReasoningDeltaEvent {
    return {
      type: "reasoning_delta",
      content: {
        delta,
      },
      metadata: this.metadata,
    };
  }

  private async *yieldFinalEvents(): AsyncGenerator<LLMEvent> {
    for (const item of this.itemsAccumulator) {
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
      content: this.itemsAccumulator,
      metadata: this.metadata,
    }
  }

  private async *streamAnthropicContent(content: ContentBlock[]): AsyncGenerator<LLMOutputItem> {
    for (const item of content) {
      let output: LLMOutputItem;
      switch (item.type) {
        case "text":
          output = {
            type: "text_generated",
            content: {
              text: item.text,
            },
            metadata: this.metadata,
          };
          yield output;
          this.itemsAccumulator.push(output);
          break;
        case "thinking":
          output = {
            type: "reasoning_generated",
            content: {
              text: item.thinking,
            },
            metadata: this.metadata,
          };
          yield output;
          this.itemsAccumulator.push(output);
          break;
        case "tool_use":
          output = {
            type: "tool_call",
            content: {
              id: item.id,
              name: item.name,
              arguments: JSON.stringify(item.input),
            },
            metadata: this.metadata,
          };
          yield output;
          this.itemsAccumulator.push(output);
          break;
      }
    }
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

  private getMessages(
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
