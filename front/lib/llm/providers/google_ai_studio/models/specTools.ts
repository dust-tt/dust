import type {
  Content,
  FunctionCall,
  FunctionResponse,
  Part,
} from "@google/genai";

import type { FinalModelConversationType } from "@app/lib/api/assistant/preprocessing";

// Google AI Studio content types for different structures
export type GoogleTextPart = {
  text: string;
};

export type GoogleFunctionCallPart = {
  functionCall: FunctionCall;
};

export type GoogleFunctionResponsePart = {
  functionResponse: FunctionResponse;
};

export type GoogleInlineDataPart = {
  inlineData: {
    mimeType: string;
    data: string;
  };
};

export interface GoogleContent {
  role: "user" | "model";
  parts: Part[];
}

export function conversationToGoogleInput(
  input: FinalModelConversationType
): Content[] {
  const { messages } = input;
  const result: Content[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      // Transform to Google Content with role "user"
      const textContent = Array.isArray(message.content)
        ? message.content
            .map((c) => {
              if (c.type === "text") {
                return c.text;
              }
              return String(c);
            })
            .join("\n")
        : String(message.content || "");

      result.push({
        role: "user",
        parts: [{ text: textContent }],
      });
    } else if (message.role === "function") {
      // Transform function result to functionResponse part
      const functionResponsePart: GoogleFunctionResponsePart = {
        functionResponse: {
          name: message.function_call_id,
          response: {
            result:
              typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content),
          },
        },
      };

      // Find the last message and append or create model message with function response
      if (result.length > 0 && result[result.length - 1].role === "model") {
        const lastMessage = result[result.length - 1];
        if (lastMessage.parts) {
          lastMessage.parts.push(functionResponsePart);
        } else {
          lastMessage.parts = [functionResponsePart];
        }
      } else {
        result.push({
          role: "model",
          parts: [functionResponsePart],
        });
      }
    } else if (message.role === "assistant") {
      // Check if it has function_calls property
      if ("function_calls" in message && message.function_calls) {
        // Transform to model message with function calls
        const parts: Part[] = [];

        // Add text content if present
        if (message.content) {
          parts.push({
            text: message.content,
          });
        }

        // Add function calls
        for (const fc of message.function_calls) {
          parts.push({
            functionCall: {
              name: fc.name,
              args: JSON.parse(fc.arguments),
            },
          });
        }

        result.push({
          role: "model",
          parts: parts,
        });
      } else {
        // Transform to regular model message
        result.push({
          role: "model",
          parts: [{ text: message.content ?? "" }],
        });
      }
    }
  }

  // Filter out messages with empty parts to avoid Google AI Studio errors
  const filteredResult = result.filter((content) => {
    return (
      content.parts &&
      content.parts.length > 0 &&
      content.parts.some((part) => {
        if ("text" in part) {
          return part.text && part.text.trim() !== "";
        }
        if ("functionCall" in part || "functionResponse" in part) {
          return true;
        }
        if ("inlineData" in part) {
          return true;
        }
        return false;
      })
    );
  });

  return filteredResult;
}
