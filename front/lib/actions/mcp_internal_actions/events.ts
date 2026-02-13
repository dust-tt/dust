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

  // For medium-stake tools: which arguments will be saved for future auto-approval.
  argumentsRequiringApproval?: string[];
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
export interface ToolPersonalAuthRequiredEvent
  extends ToolExecution<
    MCPValidationMetadataType & {
      mcpServerId: string;
      mcpServerDisplayName: string;
    }
  > {
  type: "tool_personal_auth_required";
  authError: ToolPersonalAuthError;
}

type ToolFileAuthError = {
  fileId: string;
  fileName: string;
  connectionId: string;
  mimeType: string;
  toolName: string;
  message: string;
};

// Pauses agent execution to prompt user for file access consent (e.g., Google Drive).
// Non-terminal because the tool can resume once the user authorizes the file.
export interface ToolFileAuthRequiredEvent
  extends ToolExecution<
    MCPValidationMetadataType & {
      mcpServerId: string;
      mcpServerDisplayName: string;
    }
  > {
  type: "tool_file_auth_required";
  fileAuthError: ToolFileAuthError;
}

export interface MCPApproveExecutionEvent extends ToolExecution {
  type: "tool_approve_execution";
}

export interface ToolUserQuestionEvent extends ToolExecution {
  type: "tool_user_question";
  question: string;
  options: Array<{ label: string; description?: string }>;
  allowMultiple: boolean;
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
