import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { DeleteAgentArgs } from "@app/lib/api/actions/servers/agent_authoring/metadata";
import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:avervaet,label:security] requires-editor-or-admin
 * `deleteAgent` MUST fail with an `MCPError` and archive nothing unless the caller is an editor
 * of the target agent or a workspace admin.
 */
/**
 * @cc [owner:avervaet,label:product] active-agents-only
 * `deleteAgent` MUST fail with an `MCPError`, without archiving, when the target agent does not
 * exist or is not currently `active` (e.g. already archived, or still `pending`/`draft`).
 */
export async function deleteAgent(
  auth: Authenticator,
  { agentId }: DeleteAgentArgs
): Promise<Result<LightAgentConfigurationType, MCPError>> {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });

  if (!agent || agent.status !== "active") {
    return new Err(new MCPError("Agent not found."));
  }

  if (!agent.canEdit && !auth.isAdmin()) {
    return new Err(
      new MCPError(
        "You need to be an editor of this agent, or a workspace admin, to delete it."
      )
    );
  }

  await archiveAgentConfiguration(auth, agentId);

  return new Ok(agent);
}

export async function deleteAgentHandler(
  args: DeleteAgentArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await deleteAgent(auth, args);
  if (result.isErr()) {
    return result;
  }

  const agent = result.value;

  return new Ok([
    {
      type: "text" as const,
      text: `Deleted agent "${agent.name}" (${agent.sId}).`,
    },
  ]);
}
