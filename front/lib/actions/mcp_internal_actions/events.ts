type ToolPersonalAuthError = {
  mcpServerId: string;
  provider: string;
  scope?: string;
  toolName: string;
  message: string;
};

// Event sent when personal authentication is required for a tool call.
// This is a non-terminal event that pauses the workflow until authentication is completed.
export type ToolPersonalAuthRequiredEvent = {
  type: "tool_personal_auth_required";
  created: number;
  configurationId: string;
  messageId: string;
  conversationId: string;
  authError: ToolPersonalAuthError;
  // TODO(DURABLE-AGENTS 2025-12-05): Move to a deferred event base interface.
  metadata?: {
    pubsubMessageId?: string;
  };
  isLastBlockingEventForStep?: boolean;
};

export type ToolEarlyExitEvent = {
  type: "tool_early_exit";
  created: number;
  configurationId: string;
  messageId: string;
  conversationId: string;
  text: string;
  isError: boolean;
};
