import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { AgentMessageType, Result } from "@app/types";
import { assertNever, Err, isString, Ok } from "@app/types";

import { isServerSideMCPToolConfiguration } from "./types/guards";

export interface ToolInputContext {
  agentId: string;
  toolInputs: Record<string, unknown>;
}

export async function getExecutionStatusFromConfig(
  auth: Authenticator,
  actionConfiguration: MCPToolConfigurationType,
  agentMessage: AgentMessageType,
  context?: ToolInputContext
): Promise<{
  stake?: MCPToolStakeLevelType;
  status: "ready_allowed_implicitly" | "blocked_validation_required";
  serverId?: string;
}> {
  // If the agent message is marked as "skipToolsValidation" we skip all tools validation
  // irrespective of the `actionConfiguration.permission`. This is set when the agent message was
  // created by an API call where the caller explicitly set `skipToolsValidation` to true.
  if (agentMessage.skipToolsValidation) {
    return { status: "ready_allowed_implicitly" };
  }

  // Permissions:
  // - "never_ask": Automatically approved
  // - "low": Ask user for approval and allow to automatically approve next time
  // - "medium": Ask user for approval per (agent, argument values) combination
  // - "high": Ask for approval each time
  // - undefined: Use default permission ("never_ask" for default tools, "high" for other tools)
  switch (actionConfiguration.permission) {
    case "never_ask":
      return { status: "ready_allowed_implicitly" };
    case "low": {
      // The user may not be populated, notably when using the public API.
      const user = auth.user();

      if (user) {
        const userHasAlwaysApproved = await hasUserAlwaysApprovedTool({
          user,
          mcpServerId: actionConfiguration.toolServerId,
          functionCallName: actionConfiguration.name,
        });
        if (userHasAlwaysApproved) {
          return { status: "ready_allowed_implicitly" };
        }
      }
      return { status: "blocked_validation_required" };
    }
    case "medium": {
      // Medium stake requires per-argument, per-agent approval.
      // If context is missing, we block.
      const user = auth.user();
      if (
        !user ||
        !context ||
        !isServerSideMCPToolConfiguration(actionConfiguration)
      ) {
        return { status: "blocked_validation_required" };
      }

      const { agentId, toolInputs } = context;

      const approvalHoldingArgs =
        actionConfiguration.approvalHoldingArguments ?? [];

      const userHasApproved = await hasUserApprovedToolWithArgs({
        user,
        mcpServerId: actionConfiguration.toolServerId,
        toolName: actionConfiguration.name,
        agentId,
        approvalHoldingArgs,
        toolInputs,
      });

      if (userHasApproved) {
        return { status: "ready_allowed_implicitly" };
      }
      return { status: "blocked_validation_required" };
    }
    case "high":
      return { status: "blocked_validation_required" };
    default:
      assertNever(actionConfiguration.permission);
  }
}

const TOOLS_VALIDATION_WILDCARD = "*";

const getToolsValidationKey = (mcpServerId: string) =>
  `toolsValidations:${mcpServerId}`;

// The function call name is scoped by MCP servers so that the same tool name on different servers
// does not conflict, which is why we use it here instead of the tool name.
export async function setUserAlwaysApprovedTool({
  user,
  mcpServerId,
  functionCallName,
}: {
  user: UserResource;
  mcpServerId: string;
  functionCallName: string;
}) {
  if (!functionCallName) {
    throw new Error("functionCallName is required");
  }
  if (!mcpServerId) {
    throw new Error("mcpServerId is required");
  }

  await user.upsertMetadataArray(
    getToolsValidationKey(mcpServerId),
    functionCallName
  );
}

export async function hasUserAlwaysApprovedTool({
  user,
  mcpServerId,
  functionCallName,
}: {
  user: UserResource;
  mcpServerId: string;
  functionCallName: string;
}) {
  if (!mcpServerId) {
    throw new Error("mcpServerId is required");
  }

  if (!functionCallName) {
    throw new Error("functionCallName is required");
  }

  const metadata = await user.getMetadataAsArray(
    getToolsValidationKey(mcpServerId)
  );
  return (
    metadata.includes(functionCallName) ||
    metadata.includes(TOOLS_VALIDATION_WILDCARD)
  );
}

// For agent-scoped, argument-value-scoped approvals, we build a unique key
// based on the MCP server ID, tool name, and argument values.
// The argument key-value pairs are sorted to ensure consistent ordering.
function buildArgApprovalKey(
  mcpServerId: string,
  toolName: string,
  args: Record<string, string>
): string {
  const sortedPairs = Object.entries(args)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(":");

  return `argApprovals:${mcpServerId}:${toolName}:${sortedPairs}`;
}

// Extracts the values of the approval-holding arguments from the tool inputs,
// converting them to strings for storage. Skips any arguments that are not provided.
function extractApprovalHoldingArgValues(
  approvalHoldingArgs: string[],
  toolInputs: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const argName of approvalHoldingArgs) {
    const value = toolInputs[argName];
    if (value === undefined || value === null) {
      // Skip optional args that are not provided
      continue;
    }

    if (isString(value)) {
      result[argName] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[argName] = String(value);
    } else {
      // For objects/arrays, use stable JSON representation
      result[argName] = JSON.stringify(value);
    }
  }

  return result;
}

// Checks if the user has approved this specific tool with these specific
// argument values for this specific agent.
export async function hasUserApprovedToolWithArgs({
  user,
  mcpServerId,
  toolName,
  agentId,
  approvalHoldingArgs,
  toolInputs,
}: {
  user: UserResource;
  mcpServerId: string;
  toolName: string;
  agentId: string;
  approvalHoldingArgs: string[];
  toolInputs: Record<string, unknown>;
}): Promise<Result<boolean, Error>> {
  if (!mcpServerId || !toolName || !agentId) {
    return new Err(
      new Error("mcpServerId, toolName, and agentId are required")
    );
  }

  const argValues = extractApprovalHoldingArgValues(
    approvalHoldingArgs,
    toolInputs
  );

  // If no approval-holding args have values, fall back to tool-level check
  if (Object.keys(argValues).length === 0) {
    return new Ok(false);
  }

  const key = buildArgApprovalKey(mcpServerId, toolName, argValues);
  const approvedAgents = await user.getMetadataAsArray(key);

  return new Ok(approvedAgents.includes(agentId));
}

export async function setUserApprovedToolWithArgs({
  user,
  mcpServerId,
  toolName,
  agentId,
  approvalHoldingArgs,
  toolInputs,
}: {
  user: UserResource;
  mcpServerId: string;
  toolName: string;
  agentId: string;
  approvalHoldingArgs: string[];
  toolInputs: Record<string, unknown>;
}): Promise<Result<void, Error>> {
  if (!mcpServerId || !toolName || !agentId) {
    return new Err(Error("mcpServerId, toolName, and agentId are required"));
  }

  const argValues = extractApprovalHoldingArgValues(
    approvalHoldingArgs,
    toolInputs
  );

  // If no approval-holding args have values, don't store anything
  if (Object.keys(argValues).length === 0) {
    return new Ok(undefined);
  }

  const key = buildArgApprovalKey(mcpServerId, toolName, argValues);
  await user.upsertMetadataArray(key, agentId);

  return new Ok(undefined);
}
