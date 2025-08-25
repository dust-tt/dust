/**
 * Personal authentication required event type from MCP actions.
 * This needs to be defined here to avoid circular dependencies.
 */
export type ToolPersonalAuthRequiredEvent = {
  type: "tool_personal_auth_required";
  created: number;
  configurationId: string;
  messageId: string;
  authError: {
    conversationId: string;
    messageId: string;
    mcpServerId: string;
    provider: string;
    scope?: string;
    toolName: string;
    message: string;
  };
};
