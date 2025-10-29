import type { Content, FunctionResponse, Part, Tool } from "@google/genai";
import assert from "assert";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  AssistantMessageTypeModel,
  FunctionMessageTypeModel,
  ImageContent,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  TextContent,
} from "@app/types";
import { assertNever, isRecord, safeParseJSON } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
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
  content: TextContent | ImageContent
): Promise<Part> {
  switch (content.type) {
    case "text":
      return { text: content.text };
    case "image_url":
      // Google only accepts images as base64 inline data
      // TODO(LLM-Router 2025-10-27): Handle error properly and send Non retryableError event
      const { mediaType, data } = await trustedFetchImageBase64(
        content.image_url.url
      );

      if (!GOOGLE_AI_STUDIO_SUPPORTED_MIME_TYPES.includes(mediaType)) {
        // TODO(LLM-Router 2025-10-27): Handle error properly and send Non retryableError event
        throw new Error(
          `Image mime type ${mediaType} is not supported by Google AI Studio`
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
  content: ReasoningContentType | TextContentType | FunctionCallContentType
): Part {
  switch (content.type) {
    case "reasoning":
      assert(content.value.reasoning, "Reasoning content is missing reasoning");
      return {
        text: content.value.reasoning,
        thought: true,
        // TODO(LLM-Router 2025-10-27): add thoughtSignature
      };
    case "text_content":
      return {
        text: content.value,
      };
    case "function_call": {
      const argsRes = safeParseJSON(content.value.arguments);
      if (argsRes.isErr()) {
        // TODO(LLM-Router 2025-10-27): Handle error properly and send Non retryableError event
        throw new Error(
          `Failed to parse function call arguments JSON: ${argsRes.error.message}`
        );
      }
      if (argsRes.value !== null && !isRecord(argsRes.value)) {
        // TODO(LLM-Router 2025-10-27): Handle error properly and send Non retryableError event
        throw new Error(
          `Function call arguments JSON is not a record: ${content.value.arguments}`
        );
      }
      return {
        functionCall: {
          id: content.value.id,
          name: content.value.name,
          args: argsRes.value ?? undefined,
        },
      };
    }
    default:
      assertNever(content);
  }
}

async function assistantMessageToParts(
  message: AssistantMessageTypeModel
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
  message: ModelMessageTypeMultiActionsWithoutContentFragment
): Promise<Content> {
  switch (message.role) {
    case "user": {
      return {
        role: "user",
        parts: await Promise.all(message.content.map(contentToPart)),
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
