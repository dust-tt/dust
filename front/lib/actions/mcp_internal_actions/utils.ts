import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

export function makeMCPToolTextError(text: string): {
  isError: true;
  content: [TextContent];
} {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export const makeMCPToolTextSuccess = ({
  message,
  result,
}: {
  message: string;
  result?: string;
}): CallToolResult => {
  if (!result) {
    return {
      isError: false,
      content: [{ type: "text", text: message }],
    };
  }
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: result },
    ],
  };
};

export const makeMCPToolJSONSuccess = ({
  message,
  result,
}: {
  message?: string;
  result: object | string;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ],
  };
};
