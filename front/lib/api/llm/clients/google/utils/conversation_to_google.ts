import type { Content, FunctionResponse, Part, Tool } from "@google/genai";
import assert from "assert";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  FunctionMessageTypeModel,
  ImageContent,
  ModelMessageTypeMultiActionsWithoutContentFragment,
  TextContent,
} from "@app/types";
import { assertNever } from "@app/types";
import type {
  FunctionCallContentType,
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";

import { fetchImageBase64 } from "./image_utils";

async function contentToPart(
  content: TextContent | ImageContent
): Promise<Part> {
  switch (content.type) {
    case "text":
      return { text: content.text };
    case "image_url":
      // Google only accepts images as base64 inline data
      // TODO(2025-10-27 pierre): Handle error properly and send Non retryableError event
      const { mediaType, data } = await fetchImageBase64(content.image_url.url);

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
          const { mediaType, data } = await fetchImageBase64(c.image_url.url);

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

async function assistantContentToPart(
  content: ReasoningContentType | TextContentType | FunctionCallContentType
): Promise<Part> {
  switch (content.type) {
    case "reasoning":
      assert(content.value.reasoning, "Reasoning content is missing reasoning");
      return {
        text: content.value.reasoning,
        thought: true,
        // TODO(2025-10-27 pierre): add thoughtSignature
      };
    case "text_content":
      return {
        text: content.value,
      };
    case "function_call": {
      const args = JSON.parse(content.value.arguments);
      return {
        functionCall: {
          id: content.value.id,
          name: content.value.name,
          args,
        },
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
