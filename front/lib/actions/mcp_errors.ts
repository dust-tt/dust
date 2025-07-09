export class MCPServerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: number
  ) {
    super(message);
  }
}
