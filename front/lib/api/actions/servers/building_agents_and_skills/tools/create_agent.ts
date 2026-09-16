import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { CreateAgentArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import type { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:avervaet,label:security] requires-interactive-user-and-create-permission
 * `createAgent` MUST fail with an `MCPError` and create no `AgentConfiguration` unless called with
 * an interactive user context that holds the workspace's `create` `agent` permission.
 */
/**
 * @cc [owner:avervaet,label:product] creator-is-sole-editor
 * A newly created agent MUST have the calling user as its only editor, scope `hidden`, and no
 * attached actions: `create_agent` creates instructions-only agents private to their creator.
 * Attaching tools, adding editors, or publishing the agent workspace-wide are separate,
 * explicitly-permissioned actions performed afterward, not part of creation.
 */
export async function createAgent(
  auth: Authenticator,
  { name, description, instructions }: CreateAgentArgs
): Promise<Result<AgentConfigurationType, MCPError>> {
  const user = auth.user();
  if (!user) {
    return new Err(
      new MCPError("Creating agents requires an interactive user context.")
    );
  }

  if (!(await auth.hasWorkspacePermission("create", "agent"))) {
    return new Err(new MCPError("Creating agents is restricted."));
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return new Err(new MCPError("Agent name cannot be empty."));
  }

  const { defaultModel } = await getModelsForAuth(auth);

  const result = await createOrUpgradeAgentConfiguration({
    auth,
    assistant: {
      name: trimmedName,
      description,
      instructions,
      pictureUrl: DUST_AVATAR_URL,
      // New agents start hidden and private to their creator; publishing them
      // workspace-wide is a separate, explicitly-permissioned action.
      status: "active",
      scope: "hidden",
      model: {
        modelId: defaultModel.modelId,
        providerId: defaultModel.providerId,
        temperature: 0.7,
        reasoningEffort: defaultModel.defaultReasoningEffort,
      },
      actions: [],
      templateId: null,
      tags: [],
      editors: [{ sId: user.sId }],
    },
  });

  if (result.isErr()) {
    return new Err(new MCPError(result.error.message));
  }

  return new Ok(result.value);
}

export async function createAgentHandler(
  args: CreateAgentArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await createAgent(auth, args);
  if (result.isErr()) {
    return result;
  }

  const agent = result.value;
  const owner = auth.getNonNullableWorkspace();

  return new Ok([
    {
      type: "text" as const,
      text: JSON.stringify(
        {
          agent: {
            sId: agent.sId,
            name: agent.name,
            description: agent.description,
            url: `/w/${owner.sId}/builder/agents/${agent.sId}`,
          },
        },
        null,
        2
      ),
    },
  ]);
}
