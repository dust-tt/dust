export type MCPServerPersonalAuthenticationRequiredMetadata = {
  mcp_server_id: string;
  provider: string;
  scope?: string;
  conversationId: string;
  messageId: string;
};

export function isMCPServerPersonalAuthenticationRequiredMetadata(
  metadata: unknown
): metadata is MCPServerPersonalAuthenticationRequiredMetadata {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "mcp_server_id" in metadata &&
    typeof metadata.mcp_server_id === "string" &&
    "provider" in metadata &&
    typeof metadata.provider === "string" &&
    "conversationId" in metadata &&
    typeof metadata.conversationId === "string" &&
    "messageId" in metadata &&
    typeof metadata.messageId === "string"
  );
}

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
