import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import type { UserQuestion } from "@app/lib/actions/types";
import type { OAuthProvider } from "@app/types/oauth/lib";

// Identifiers scoping an event to the run context it was emitted from, mirroring the contextType
// split of AgentLoopRunContextType / SandboxFunctionRunContextType.
export type AgentLoopEventScope = {
  configurationId: string;
  messageId: string;
  conversationId: string;
};

export type SandboxFunctionEventScope = {
  sandboxFunctionId: string;
  invocationId: string;
};

interface ToolExecutionBase<
  T extends MCPValidationMetadataType = MCPValidationMetadataType,
> {
  actionId: string;
  // User might be undefined if the run was initiated through the public API using an API key.
  userId?: string;
  created: number;

  stake?: MCPToolStakeLevelType;
  isLastBlockingEventForStep?: boolean;
  metadata: T;

  inputs: Record<string, unknown>;

  // For medium-stake tools: which arguments will be saved for future auto-approval.
  argumentsRequiringApproval?: string[];
  // Human-readable label describing the scope of an "always allow" approval.
  approvalArgsLabel?: string;
}

// Tool execution scoped to an agent loop run: carries the conversation-scoped identifiers used on
// the conversation message channel.
export interface AgentLoopToolExecution<
  T extends MCPValidationMetadataType = MCPValidationMetadataType,
> extends ToolExecutionBase<T>,
    AgentLoopEventScope {}

// Tool execution scoped to a sandbox function invocation.
export interface SandboxFunctionToolExecution<
  T extends MCPValidationMetadataType = MCPValidationMetadataType,
> extends ToolExecutionBase<T>,
    SandboxFunctionEventScope {}

type ToolPersonalAuthError = {
  mcpServerId: string;
  provider: OAuthProvider;
  scope?: string;
  toolName: string;
  message: string;
};

type ToolAuthMetadataType = MCPValidationMetadataType & {
  mcpServerId: string;
  mcpServerDisplayName: string;
};

// Event sent when personal authentication is required for a tool call.
// This is a non-terminal event that pauses the workflow until authentication is completed.
export interface AgentLoopToolPersonalAuthRequiredEvent
  extends AgentLoopToolExecution<ToolAuthMetadataType> {
  type: "tool_personal_auth_required";
  authError: ToolPersonalAuthError;
}

export interface SandboxFunctionToolPersonalAuthRequiredEvent
  extends SandboxFunctionToolExecution<ToolAuthMetadataType> {
  type: "tool_personal_auth_required";
  authError: ToolPersonalAuthError;
}

export type ToolPersonalAuthRequiredEvent =
  | AgentLoopToolPersonalAuthRequiredEvent
  | SandboxFunctionToolPersonalAuthRequiredEvent;

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
export interface AgentLoopToolFileAuthRequiredEvent
  extends AgentLoopToolExecution<ToolAuthMetadataType> {
  type: "tool_file_auth_required";
  fileAuthError: ToolFileAuthError;
}

export interface SandboxFunctionToolFileAuthRequiredEvent
  extends SandboxFunctionToolExecution<ToolAuthMetadataType> {
  type: "tool_file_auth_required";
  fileAuthError: ToolFileAuthError;
}

export type ToolFileAuthRequiredEvent =
  | AgentLoopToolFileAuthRequiredEvent
  | SandboxFunctionToolFileAuthRequiredEvent;

export interface AgentLoopMCPApproveExecutionEvent
  extends AgentLoopToolExecution {
  type: "tool_approve_execution";
  editableArguments?: readonly string[];
}

export interface SandboxFunctionMCPApproveExecutionEvent
  extends SandboxFunctionToolExecution {
  type: "tool_approve_execution";
}

// Scope-neutral approval event fields. Callers add agent-loop or sandbox-function identifiers.
export interface MCPApproveExecutionEventBase extends ToolExecutionBase {
  type: "tool_approve_execution";
}

export type MCPApproveExecutionEvent =
  | AgentLoopMCPApproveExecutionEvent
  | SandboxFunctionMCPApproveExecutionEvent;

export interface AgentLoopToolAskUserQuestionEvent
  extends AgentLoopToolExecution {
  type: "tool_ask_user_question";
  question: UserQuestion;
}

export interface SandboxFunctionToolAskUserQuestionEvent
  extends SandboxFunctionToolExecution {
  type: "tool_ask_user_question";
  question: UserQuestion;
}

export type ToolAskUserQuestionEvent =
  | AgentLoopToolAskUserQuestionEvent
  | SandboxFunctionToolAskUserQuestionEvent;

type ToolEarlyExitEventBase = {
  type: "tool_early_exit";
  created: number;
  text: string;
  isError: boolean;
  reason?: "deploy_interruption" | "user_cancellation" | "none";
};

export type AgentLoopToolEarlyExitEvent = ToolEarlyExitEventBase &
  AgentLoopEventScope;

export type SandboxFunctionToolEarlyExitEvent = ToolEarlyExitEventBase &
  SandboxFunctionEventScope;

export type ToolEarlyExitEvent =
  | AgentLoopToolEarlyExitEvent
  | SandboxFunctionToolEarlyExitEvent;

/**
 * Internal signal emitted by `getExitOrPauseEvents` whenever it processes a
 * `tool_blocked_awaiting_input` resource. Carries no UI payload — the
 * user-facing blocking events (if any) are forwarded separately in the same
 * batch. Its sole purpose is to keep the agent-loop pause-decision on the
 * event channel instead of a side-channel `action.status` check: any tool
 * that pauses without yielding a user-facing event (e.g. sandbox bash, where
 * the child's blocking event was published upstream by `createSandboxChildAction`
 * and never flows through bash's return) still triggers a clean pause.
 *
 * Not published to the message channel; consumed only by `runToolWithStreaming`
 * (to skip `markAsSucceeded`) and `executeToolStreaming` (to set
 * `shouldPauseAgentLoop`).
 */
type ToolPausedEventBase = {
  type: "tool_paused";
  created: number;
  actionId: string;
};

export type AgentLoopToolPausedEvent = ToolPausedEventBase &
  AgentLoopEventScope;

export type SandboxFunctionToolPausedEvent = ToolPausedEventBase &
  SandboxFunctionEventScope;

export type ToolPausedEvent =
  | AgentLoopToolPausedEvent
  | SandboxFunctionToolPausedEvent;
