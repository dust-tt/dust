import { sandboxFunctionNameFromSlug } from "@app/lib/api/sandbox_functions/slug";
import type { Authenticator } from "@app/lib/auth";
import { PodAppShareResource } from "@app/lib/resources/pod_app_share_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  SandboxFunctionInvocationContext,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";

async function resolveShare(
  auth: Authenticator,
  mcpServerId: string
): Promise<{ share: PodAppShareResource; space: SpaceResource } | null> {
  const share = await PodAppShareResource.fetchByInternalMCPServerId(
    auth,
    mcpServerId
  );
  if (!share) {
    return null;
  }
  return { share, space: share.space };
}

/**
 * Whether the current caller can ever satisfy a function's userIdentity policy from the agent
 * loop. A courtesy filter for listing only — the policy itself is re-checked at invocation.
 */
function isCallableFromAgentLoop(
  userIdentity: SandboxFunctionUserIdentityPolicy,
  isPodMember: boolean
): boolean {
  switch (userIdentity) {
    case "optional":
    case "workspace_user_required":
      return true;
    // Agent-loop invocations are never interactive sessions.
    case "interactive_workspace_user_required":
      return false;
    case "pod_member_required":
      return isPodMember;
    default:
      // Retired or unknown policies deny, matching authorizeSandboxFunctionInvocation.
      assertNeverAndIgnore(userIdentity);
      return false;
  }
}

/**
 * The stored JSON Schema, narrowed to the MCP wire shape. Published functions always carry an
 * object-typed input schema (publish extracts it from the author's zod object); the SDK schema
 * validates that invariant rather than a cast assuming it.
 */
function asToolInputSchema(schema: JSONSchema): Tool["inputSchema"] {
  return ToolSchema.shape.inputSchema.parse(schema);
}

export async function listPodAppTools(
  auth: Authenticator,
  mcpServerId: string
): Promise<Tool[]> {
  const resolved = await resolveShare(auth, mcpServerId);
  if (!resolved) {
    return [];
  }
  const { share, space } = resolved;

  const sandboxFunctions = await SandboxFunctionResource.listByPodAppShare(
    auth,
    share
  );
  const isPodMember = space.isMember(auth);

  return sandboxFunctions
    .filter((sandboxFunction) =>
      // A null stored policy means "optional", matching authorizeSandboxFunctionInvocation.
      isCallableFromAgentLoop(
        sandboxFunction.userIdentity ?? "optional",
        isPodMember
      )
    )
    .map((sandboxFunction) => {
      const name = sandboxFunctionNameFromSlug(sandboxFunction.slug);
      return {
        name,
        description: sandboxFunction.description,
        inputSchema: asToolInputSchema(sandboxFunction.inputSchema),
        _meta: {
          dust: {
            stake: "low",
            displayLabels: {
              running: `Calling ${name}...`,
              done: `Called ${name}`,
            },
          },
        },
      };
    });
}

export async function callPodAppTool(
  auth: Authenticator,
  mcpServerId: string,
  toolName: string,
  args: Record<string, unknown>,
  context?: SandboxFunctionInvocationContext
): Promise<CallToolResult> {
  // Implemented in the next task.
  throw new Error("Not implemented");
}
