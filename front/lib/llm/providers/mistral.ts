import { Mistral } from "@mistralai/mistralai";
import type { AssistantMessage } from "@mistralai/mistralai/models/components/assistantmessage";
import type { CompletionEvent } from "@mistralai/mistralai/models/components/completionevent";
import type { ContentChunk } from "@mistralai/mistralai/models/components/contentchunk";
import type { SystemMessage } from "@mistralai/mistralai/models/components/systemmessage";
import type { ToolMessage } from "@mistralai/mistralai/models/components/toolmessage";
import type { UserMessage } from "@mistralai/mistralai/models/components/usermessage";

import { LLM } from "@app/lib/llm/llm";
import type { LLMEvent, ProviderMetadata } from "@app/lib/llm/types";
import type {
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
} from "@app/types";
import { dustManagedCredentials } from "@app/types/api/credentials";

type MistralMessage =
  | (SystemMessage & { role: "system" })
  | (ToolMessage & { role: "tool" })
  | (UserMessage & { role: "user" })
  | (AssistantMessage & { role: "assistant" });

export class MistralLLM extends LLM {
  private client: Mistral;
  private metadata: ProviderMetadata = {
    providerId: "mistral",
    modelId: this.model.modelId,
  };
  private textAccumulator = "";
  private thinkingAccumulator = "";
  protected temperature: number;
  constructor({
    temperature,
    model,
  }: {
    temperature: number;
    model: ModelConfigurationType;
  }) {
    super(model);
    this.temperature = temperature;
    this.client = new Mistral({
      apiKey: dustManagedCredentials().MISTRAL_API_KEY,
    });
  }

  private resetAccumulators() {
    this.textAccumulator = "";
    this.thinkingAccumulator = "";
  }

  async *stream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMEvent> {
    this.resetAccumulators();

    const events = this.modelStream({
      conversation,
      prompt,
    });

    for await (const event of events) {
      const chunk = event.data.choices[0].delta;
      if (chunk.content && !chunk.toolCalls) {
        if (typeof chunk.content === "string") {
          yield this.textDelta(chunk.content);
        } else {
          yield* this.streamMistralContent(chunk.content);
        }
      }

      if (event.data.choices[0].finishReason) {
        yield* this.yieldFinalEvents(event);
        return;
      }
    }
  }

  private textDelta(delta: string): LLMEvent {
    this.textAccumulator += delta;
    return {
      type: "text_delta",
      content: {
        delta,
      },
      metadata: this.metadata,
    };
  }

  private reasoningDelta(delta: string): LLMEvent {
    this.thinkingAccumulator += delta;
    return {
      type: "reasoning_delta",
      content: {
        delta: delta,
      },
      metadata: this.metadata,
    };
  }

  // returns token usage and success/error completion events
  private async *yieldFinalEvents(
    event: CompletionEvent
  ): AsyncGenerator<LLMEvent> {
    const tokenUsage = event.data.usage;
    if (tokenUsage) {
      yield {
        type: "token_usage",
        content: {
          inputTokens: tokenUsage.promptTokens ?? 0,
          outputTokens: tokenUsage.completionTokens ?? 0,
          totalTokens: tokenUsage.totalTokens ?? 0,
        },
        metadata: this.metadata,
      };
    }
    const finishReason = event.data.choices[0].finishReason;
    if (finishReason === "error" || finishReason === "length") {
      yield {
        type: "error",
        content: {
          code: finishReason,
          message: finishReason,
        },
        metadata: this.metadata,
      };
    } else {
      yield {
        type: "success",
        content: [
          {
            type: "text_generated",
            content: {
              text: this.textAccumulator,
            },
            metadata: this.metadata,
          },
        ],
        metadata: {
          ...this.metadata,
          id: event.data.id,
          created: event.data.created,
        },
      };
    }
  }

  async *modelStream({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<CompletionEvent> {
    const messages = this.getMessages({
      conversation,
      prompt,
    });

    const events = await this.client.chat.stream({
      model: this.model.modelId,
      messages,
      temperature: this.temperature,
      stream: true,
    });

    for await (const event of events) {
      yield event;
    }
  }

  private async *streamMistralContent(
    content: ContentChunk[]
  ): AsyncGenerator<LLMEvent> {
    for (const contentItem of content) {
      switch (contentItem.type) {
        case "text":
          yield this.textDelta(contentItem.text);
          break;
        case "thinking":
          for (const thinkingItem of contentItem.thinking) {
            if (thinkingItem.type === "text") {
              yield this.reasoningDelta(thinkingItem.text);
            }
          }
          break;
        default:
          continue;
      }
    }
  }

  private getMessages({
    conversation,
    prompt,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
  }): MistralMessage[] {
    const messages: MistralMessage[] = conversation.messages
      .filter((message) => message.role !== "content_fragment") // content_fragments should have been removed by now
      .map((message) => {
        let content: string | ContentChunk[];
        if (typeof message.content === "string") {
          content = message.content;
        } else {
          content = message.content
            ? message.content.map((content) => {
                switch (content.type) {
                  case "text":
                    return {
                      type: "text",
                      text: content.text,
                    };
                  case "image_url":
                    return {
                      type: "image_url",
                      imageUrl: content.image_url.url,
                    };
                }
              })
            : [];
        }
        return {
          role: message.role === "function" ? "tool" : message.role,
          content: content,
        };
      });
    return [
      {
        role: "system",
        content: prompt,
      },
      ...messages,
    ];
  }
}
