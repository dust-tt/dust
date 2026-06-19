import type { Client } from "@app/lib/model_constructors/client";
import type { GoogleAiStudioInputConfig } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import {
  assistantReasoningMessageToPart,
  assistantTextMessageToPart,
  assistantToolCallRequestToPart,
  type ContentBlockConverters,
  conversationToContents,
  effortToThinkingLevel,
  forceToolNameToToolConfig,
  outputFormatToResponseSchema,
  systemMessagesToSystemInstruction,
  systemMessageToPart,
  toFunctionDeclaration,
  toolCallResultMessageToContent,
  userImageMessageToPart,
  userTextMessageToPart,
} from "@app/lib/model_constructors/sdk/google_genai/converters/input/utils";
import type {
  Payload,
  SystemTextMessage,
} from "@app/lib/model_constructors/types/input/messages";
import type { Content, GenerateContentParameters } from "@google/genai";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Turns our provider-agnostic conversation/config into the Gemini
// `generateContentStream` request shape. Leaf converters are bound as class
// fields and composites route through `this`, so an endpoint can override a
// single leaf.
export function WithGoogleGenAIInputConverter<
  TBase extends AbstractConstructor<Client<GoogleAiStudioInputConfig>>,
>(Base: TBase) {
  abstract class WithGoogleGenAIInputConverter
    extends Base
    implements ContentBlockConverters
  {
    systemMessageToPart = systemMessageToPart;
    userTextMessageToPart = userTextMessageToPart;
    userImageMessageToPart = userImageMessageToPart;
    toolCallResultMessageToContent = toolCallResultMessageToContent;
    assistantTextMessageToPart = assistantTextMessageToPart;
    assistantReasoningMessageToPart = assistantReasoningMessageToPart;
    assistantToolCallRequestToPart = assistantToolCallRequestToPart;

    conversationToContents(
      conversation: Payload["conversation"]
    ): Promise<Content[]> {
      return conversationToContents(conversation, this);
    }

    systemMessagesToSystemInstruction(
      system: SystemTextMessage[]
    ): Content | undefined {
      return systemMessagesToSystemInstruction(system, this);
    }

    async buildRequestPayload(
      payload: Payload,
      config: GoogleAiStudioInputConfig
    ): Promise<GenerateContentParameters> {
      const { conversation } = payload;
      const {
        tools = [],
        temperature,
        reasoning,
        forceTool,
        outputFormat,
      } = config;

      return {
        model: this.constructor.modelId,
        contents: await this.conversationToContents(conversation),
        config: {
          systemInstruction: this.systemMessagesToSystemInstruction(
            conversation.system
          ),
          // We only ever need a single candidate.
          candidateCount: 1,
          temperature,
          tools:
            tools.length > 0
              ? [{ functionDeclarations: tools.map(toFunctionDeclaration) }]
              : undefined,
          toolConfig: forceToolNameToToolConfig(tools, forceTool),
          thinkingConfig: {
            includeThoughts: true,
            thinkingLevel: reasoning
              ? effortToThinkingLevel(reasoning.effort)
              : undefined,
          },
          maxOutputTokens: this.constructor.maxOutputTokens,
          ...(outputFormat
            ? {
                responseMimeType: "application/json",
                responseSchema: outputFormatToResponseSchema(outputFormat),
              }
            : {}),
        },
      };
    }
  }

  return WithGoogleGenAIInputConverter;
}
