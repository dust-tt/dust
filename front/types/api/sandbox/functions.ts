export type SandboxFunctionInvocationStatus = "created";

export type SandboxFunctionInvocationType = {
  id: string;
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
