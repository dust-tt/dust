type ToolPersonalAuthError = {
  mcpServerId: string;
  provider: string;
  scope?: string;
  toolName: string;
  message: string;
};

/**
 * Personal authentication required event type from MCP actions.
 * This needs to be defined here to avoid circular dependencies.
 */
export type ToolPersonalAuthRequiredEvent = {
  type: "tool_personal_auth_required";
  created: number;
  configurationId: string;
  messageId: string;
  conversationId: string;
  authError: ToolPersonalAuthError;
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
