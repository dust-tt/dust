export const SANDBOX_FUNCTION_INVOCATION_STATUSES = ["created"] as const;

export type SandboxFunctionInvocationStatus =
  (typeof SANDBOX_FUNCTION_INVOCATION_STATUSES)[number];

export type SandboxFunctionInvocationType = {
  sId: string;
  functionId: string;
  status: SandboxFunctionInvocationStatus;
  createdAt: string;
};

export type PostSandboxFunctionInvocationRequestBody = {
  input?: unknown;
  context?: {
    frameFileId?: string;
  };
};

export type PostSandboxFunctionInvocationResponseBody = {
  invocation: SandboxFunctionInvocationType;
};
