import type { Content, FunctionResponse, Part, Tool } from "@google/genai";
import assert from "assert";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { EventError } from "@app/lib/api/llm/types/events";
import { extractEncryptedContentFromMetadata } from "@app/lib/api/llm/utils";
import { parseToolArguments } from "@app/lib/api/llm/utils/tool_arguments";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  FunctionMessageTypeModel,
  ImageContent,
  ModelIdType,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  TextContent,
} from "@app/types";
import { assertNever } from "@app/types";
import type {
  AgentFunctionCallContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import { trustedFetchImageBase64 } from "@app/types/shared/utils/image_utils";

const GOOGLE_AI_STUDIO_SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

async function contentToPart(
  content: TextContent | ImageContent,
  modelId: ModelIdType
): Promise<Part> {
  switch (content.type) {
    case "text":
      return { text: content.text };
    case "image_url":
      // Google only accepts images as base64 inline data
      const { mediaType, data } = await trustedFetchImageBase64(
        content.image_url.url
      );

      if (!GOOGLE_AI_STUDIO_SUPPORTED_MIME_TYPES.includes(mediaType)) {
        throw new EventError(
          {
            type: "invalid_request_error",
            message: `Image mime type ${mediaType} is not supported by Google AI Studio`,
            isRetryable: false,
          },
          {
            clientId: "google_ai_studio",
            modelId,
          }
        );
      }

      return {
        inlineData: {
          mimeType: mediaType,
          data,
        },
      };
    default:
      assertNever(content);
  }
}

async function functionMessageToResponses(
  message: FunctionMessageTypeModel
): Promise<FunctionResponse[]> {
  if (typeof message.content === "string") {
    return [
      {
        response: { output: message.content },
        name: message.name,
        id: message.function_call_id,
      },
    ];
  }

  const functionResponses = await Promise.all(
    message.content.map(async (c) => {
      switch (c.type) {
        case "text":
          return {
            response: { output: c.text },
            name: message.name,
            id: message.function_call_id,
          };
        case "image_url":
          const { mediaType, data } = await trustedFetchImageBase64(
            c.image_url.url
          );

          return {
            parts: [{ inlineData: { data, mimeType: mediaType } }],
            name: message.name,
            id: message.function_call_id,
          };
        default:
          assertNever(c);
      }
    })
  );

  return functionResponses;
}

function assistantContentToPart(
  content:
    | AgentReasoningContentType
    | AgentTextContentType
    | AgentFunctionCallContentType
): Part {
  switch (content.type) {
    case "reasoning":
      assert(content.value.reasoning, "Reasoning content is missing reasoning");
      return {
        text: content.value.reasoning,
        thought: true,
        thoughtSignature: extractEncryptedContentFromMetadata(
          content.value.metadata
        ),
      };
    case "text_content":
      return {
        text: content.value,
      };
    case "function_call": {
      return {
        functionCall: {
          id: content.value.id,
          name: content.value.name,
          args: parseToolArguments(content.value.arguments, content.value.name),
        },
        thoughtSignature: content.value.metadata?.thoughtSignature,
      };
    }
    default:
      assertNever(content);
  }
}

async function assistantMessageToParts(
  message:
    | AssistantContentMessageTypeModel
    | AssistantFunctionCallMessageTypeModel
): Promise<Content> {
  assert(message.contents, "Assistant message is missing contents");

  const parts = await Promise.all(message.contents.map(assistantContentToPart));

  return {
    role: "model",
    parts,
  };
}

export function toTool(specification: AgentActionSpecification): Tool {
  return {
    functionDeclarations: [
      {
        name: specification.name,
        description: specification.description,
        parametersJsonSchema: specification.inputSchema,
      },
    ],
  };
}

/**
 * Converts messages to Google format, optionally fetching and converting images to base64
 */
export async function toContent(
  message: ModelMessageTypeMultiActionsWithoutContentFragment,
  modelId: ModelIdType
): Promise<Content> {
  switch (message.role) {
    case "user": {
      return {
        role: "user",
        parts: await Promise.all(
          message.content.map((content) => contentToPart(content, modelId))
        ),
      };
    }
    case "function": {
      const responses = await functionMessageToResponses(message);
      return {
        role: "user",
        parts: responses.map((response) => ({
          functionResponse: response,
        })),
      };
    }
    case "assistant": {
      return assistantMessageToParts(message);
    }
    default:
      assertNever(message);
  }
}
