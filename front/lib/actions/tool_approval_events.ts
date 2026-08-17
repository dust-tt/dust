import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import {
  getInternalMCPServerDisplayedAs,
  getInternalMCPServerNameFromSId,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPApproveExecutionEventBase } from "@app/lib/actions/mcp_internal_actions/events";
import { getApprovalArgsLabel } from "@app/lib/actions/tool_approval_labels";
import { getToolDisplayLabels } from "@app/lib/actions/tool_display_labels";
import type { Authenticator } from "@app/lib/auth";

type ApprovalToolConfiguration = Pick<
  MCPToolConfigurationType,
  | "argumentsRequiringApproval"
  | "displayLabels"
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
  const internalMCPServerName = getInternalMCPServerNameFromSId(
    toolConfiguration.toolServerId
  );
  const displayLabels =
    getToolDisplayLabels({
      internalMCPServerName,
      mcpServerName: toolConfiguration.mcpServerName,
      toolName: toolConfiguration.originalName,
      inputs: approvalLabelInputs,
    }) ?? toolConfiguration.displayLabels;
  const approvalArgsLabel = await getApprovalArgsLabel({
    auth,
    internalMCPServerName,
    toolName: toolConfiguration.originalName,
    agentName: approvalSubjectName,
    inputs: approvalLabelInputs,
    argumentsRequiringApproval,
  });

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
      displayLabel: displayLabels?.done,
      agentName: approvalSubjectName,
      icon: toolConfiguration.icon,
      displayedAs: getInternalMCPServerDisplayedAs(
        toolConfiguration.toolServerId
      ),
    },
    argumentsRequiringApproval,
    approvalArgsLabel,
  };
}
