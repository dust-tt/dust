import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { AgentMessageType } from "@app/types";
import { assertNever } from "@app/types";

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

      const userHasApproved = false;
      /**
       *  const { agentId, toolInputs } = context;
       *  const argumentsRequiringApproval =
       *     actionConfiguration.argumentsRequiringApproval ?? [];
       *  const userHasApproved = await hasUserApprovedToolWithArgs({
       *    user,
       *    mcpServerId: actionConfiguration.toolServerId,
       *    toolName: actionConfiguration.name,
       *    agentId,
       *    argumentsRequiringApproval,
       *    toolInputs,
       *  });
       */

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
  await user.upsertMetadataArray(
    getToolsValidationKey(mcpServerId),
    functionCallName
  );

  /**
    await user.createToolApproval(auth, {
      mcpServerId,
      toolName: functionCallName,
      agentId: null,
      argsAndValues: null,
    });
  }
  */
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
  const metadata = await user.getMetadataAsArray(
    getToolsValidationKey(mcpServerId)
  );
  return (
    metadata.includes(functionCallName) ||
    metadata.includes(TOOLS_VALIDATION_WILDCARD)
  );
}

// Extracts the values of the approval-requiring arguments from the tool inputs,
// converting them to strings for storage. Skips any arguments that are not provided.
/** 
function extractArgRequiringApprovalValues(
  argumentsRequiringApproval: string[],
  toolInputs: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const argName of argumentsRequiringApproval) {
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
*/
