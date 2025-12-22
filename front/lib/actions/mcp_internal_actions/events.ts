import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import type { OAuthProvider } from "@app/types/oauth/lib";

export interface ToolExecution<
  T extends MCPValidationMetadataType = MCPValidationMetadataType,
> {
  conversationId: string;
  messageId: string;
  actionId: string;
  // User might be undefined if the run was initiated through the public API using an API key.
  userId?: string;
  configurationId: string;
  created: number;

  stake?: MCPToolStakeLevelType;
  isLastBlockingEventForStep?: boolean;
  metadata: T;

  inputs: Record<string, unknown>;
}

type ToolPersonalAuthError = {
  mcpServerId: string;
  provider: OAuthProvider;
  scope?: string;
  toolName: string;
  message: string;
};

// Event sent when personal authentication is required for a tool call.
// This is a non-terminal event that pauses the workflow until authentication is completed.
export interface ToolPersonalAuthRequiredEvent extends ToolExecution<
  MCPValidationMetadataType & {
    mcpServerId: string;
    mcpServerDisplayName: string;
  }
> {
  type: "tool_personal_auth_required";
  authError: ToolPersonalAuthError;
}

export interface MCPApproveExecutionEvent extends ToolExecution {
  type: "tool_approve_execution";
}

export type ToolEarlyExitEvent = {
  type: "tool_early_exit";
  created: number;
  configurationId: string;
  messageId: string;
  conversationId: string;
  text: string;
  isError: boolean;
};
