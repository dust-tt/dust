import { Mistral } from "@mistralai/mistralai";
import type { AssistantMessage } from "@mistralai/mistralai/models/components/assistantmessage";
import type { ContentChunk } from "@mistralai/mistralai/models/components/contentchunk";
import type { SystemMessage } from "@mistralai/mistralai/models/components/systemmessage";
import type { ToolMessage } from "@mistralai/mistralai/models/components/toolmessage";
import type { UserMessage } from "@mistralai/mistralai/models/components/usermessage";

import { LLM } from "@app/lib/llm/llm";
import type { LLMStreamEvent, ProviderMetadata } from "@app/lib/llm/types";
import type { RenderedModelConversationTypeMultiActions } from "@app/types";
//import { dustManagedCredentials } from "@app/types/api/credentials";

type MistralMessage =
  | (SystemMessage & { role: "system" })
  | (ToolMessage & { role: "tool" })
  | (UserMessage & { role: "user" })
  | (AssistantMessage & { role: "assistant" });

export class MistralLLM extends LLM {
  private client: Mistral;
  private baseMetadata: ProviderMetadata<"mistral"> = {
    provider: "mistral",
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
    super({ temperature, modelId, providerId: "mistral" });
    this.client = new Mistral({
      apiKey: process.env.MISTRAL_API_KEY,
    });
  }

  async *stream({
    conversation,
    prompt,
  }: {
    conversation: RenderedModelConversationTypeMultiActions;
    prompt: string;
  }): AsyncGenerator<LLMStreamEvent> {
    const mistralConversation = this.toMistralConversation({
      conversation,
      prompt,
    });
    const eventStream = await this.client.chat.stream({
      model: this.modelId,
      messages: mistralConversation,
      temperature: this.temperature,
      stream: true,
    });
    let textAccumulator = "";
    for await (const event of eventStream) {
      const chunk = event.data.choices[0].delta;
      if (chunk.content && !chunk.toolCalls) {
        if (typeof chunk.content === "string") {
          textAccumulator += chunk.content;
          yield {
            type: "text_delta",
            delta: chunk.content,
            metadata: this.baseMetadata,
          };
        } else {
          yield* this.streamMistralContent(chunk.content);
        }
      }

      if (event.data.choices[0].finishReason) {
        const tokenUsage = event.data.usage;
        yield {
          type: "success",
          items: [
            {
              type: "text_generated",
              text: textAccumulator,
              metadata: this.baseMetadata,
            },
          ],
          tokenUsage:
            tokenUsage && tokenUsage.completionTokens
              ? {
                  inputTokens: tokenUsage.promptTokens ?? 0,
                  outputTokens: tokenUsage.completionTokens,
                }
              : undefined,
          metadata: {
            ...this.baseMetadata,
            metadata: {
              id: event.data.id,
              created: event.data.created,
            },
          },
        };
        return;
      }
    }
  }

  private async *streamMistralContent(
    content: ContentChunk[]
  ): AsyncGenerator<LLMStreamEvent> {
    for (const contentItem of content) {
      switch (contentItem.type) {
        case "text":
          yield {
            type: "text_delta",
            delta: contentItem.text,
            metadata: this.baseMetadata,
          };
          break;
        case "thinking":
          for (const thinkingItem of contentItem.thinking) {
            if (thinkingItem.type === "text") {
              yield {
                type: "reasoning_delta",
                delta: thinkingItem.text,
                metadata: this.baseMetadata,
              };
            }
          }
          break;
        default:
          continue;
      }
    }
  }

  private toMistralConversation({
    conversation,
    prompt,
  }: {
    conversation: RenderedModelConversationTypeMultiActions;
    prompt: string;
  }): MistralMessage[] {
    const mistralConversation: MistralMessage[] = conversation.messages
      .filter((message) => message.content)
      .map((message) => {
        let content: string | ContentChunk[];
        if (typeof message.content === "string") {
          content = message.content;
        } else {
          content = message.content!.map((content) => {
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
          });
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
      ...mistralConversation,
    ];
  }
}
