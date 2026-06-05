export function mcpAuthError() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated." }],
    isError: true as const,
  };
}

export function mcpError(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true as const,
  };
}

export function mcpJsonResponse(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data),
      },
    ],
  };
}
