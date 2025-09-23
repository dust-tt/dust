export class MCPServerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class MCPError extends Error {
  // Whether the error should be tracked and reported on our observability stack.
  public readonly tracked: boolean;
  public readonly code?: number;

  constructor(
    message: string,
    {
      tracked = true,
      code,
      cause,
    }: { tracked?: boolean; code?: number; cause?: unknown } = {}
  ) {
    super(message, { cause });
    this.tracked = tracked;
    this.code = code;
  }
}
