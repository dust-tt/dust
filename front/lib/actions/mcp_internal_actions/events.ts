import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import type { UserQuestion } from "@app/lib/actions/types";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
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
  // Human-readable label for the "always allow" approval checkbox.
  approvalArgsLabel?: string;
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

export function buildMCPApproveExecutionEvent(
  child: AgentMCPActionResource,
  {
    agentName,
    conversationId,
    messageId,
    userId,
    isLastBlockingEventForStep,
  }: {
    agentName: string;
    conversationId: string;
    messageId: string;
    userId: string | undefined;
    isLastBlockingEventForStep: boolean;
  }
): MCPApproveExecutionEvent {
  return {
    type: "tool_approve_execution",
    actionId: child.sId,
    configurationId: child.toolConfiguration.sId,
    conversationId,
    created: Date.now(),
    inputs: child.augmentedInputs,
    messageId,
    stake: child.toolConfiguration.permission,
    userId,
    isLastBlockingEventForStep,
    metadata: {
      toolName: child.toolConfiguration.originalName,
      mcpServerName: child.toolConfiguration.mcpServerName,
      agentName,
      icon: child.toolConfiguration.icon,
    },
    argumentsRequiringApproval:
      child.toolConfiguration.argumentsRequiringApproval,
  };
}

export interface ToolAskUserQuestionEvent extends ToolExecution {
  type: "tool_ask_user_question";
  question: UserQuestion;
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
