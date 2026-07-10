import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import {
  getInternalMCPServerDisplayedAs,
  getInternalMCPServerNameFromSId,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPApproveExecutionEventBase } from "@app/lib/actions/mcp_internal_actions/events";
import { getApprovalArgsLabel } from "@app/lib/actions/tool_approval_labels";
import type { Authenticator } from "@app/lib/auth";

type ApprovalToolConfiguration = Pick<
  MCPToolConfigurationType,
  | "argumentsRequiringApproval"
  | "icon"
  | "mcpServerName"
  | "originalName"
  | "permission"
  | "toolServerId"
>;

export async function makeMCPApproveExecutionEventBase(
  auth: Authenticator,
  {
    actionId,
    toolConfiguration,
    inputs,
    approvalLabelInputs = inputs,
    approvalSubjectName,
  }: {
    actionId: string;
    toolConfiguration: ApprovalToolConfiguration;
    inputs: Record<string, unknown>;
    approvalLabelInputs?: Record<string, unknown>;
    approvalSubjectName: string;
  }
): Promise<MCPApproveExecutionEventBase> {
  const argumentsRequiringApproval =
    toolConfiguration.argumentsRequiringApproval ?? [];

  return {
    type: "tool_approve_execution",
    actionId,
    created: Date.now(),
    inputs,
    stake: toolConfiguration.permission,
    userId: auth.user()?.sId,
    metadata: {
      toolName: toolConfiguration.originalName,
      mcpServerName: toolConfiguration.mcpServerName,
      agentName: "agent",
      icon: toolConfiguration.icon,
      displayedAs: getInternalMCPServerDisplayedAs(
        toolConfiguration.toolServerId
      ),
    },
    argumentsRequiringApproval,
    approvalArgsLabel: await getApprovalArgsLabel({
      auth,
      internalMCPServerName: getInternalMCPServerNameFromSId(
        toolConfiguration.toolServerId
      ),
      toolName: toolConfiguration.originalName,
      agentName: approvalSubjectName,
      inputs: approvalLabelInputs,
      argumentsRequiringApproval,
    }),
  };
}
