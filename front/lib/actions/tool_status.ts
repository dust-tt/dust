import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { AgentMessageType } from "@app/types";
import { assertNever } from "@app/types";

export async function getExecutionStatusFromConfig(
  auth: Authenticator,
  actionConfiguration: MCPToolConfigurationType,
  agentMessage: AgentMessageType
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
