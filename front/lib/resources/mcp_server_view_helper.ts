import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { destroyAgentMCPServerConfigurationsForViews } from "@app/lib/resources/agent_mcp_server_views";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";

export async function destroyMCPServerViewDependencies(
  auth: Authenticator,
  {
    mcpServerViewIds,
    transaction,
  }: {
    mcpServerViewIds: ModelId[];
    transaction?: Transaction;
  }
) {
  await destroyAgentMCPServerConfigurationsForViews(auth, {
    mcpServerViewIds,
    transaction,
  });

  await ConversationMCPServerViewModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewIds,
    },
    transaction,
  });

  await SkillMCPServerConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewIds,
    },
    transaction,
  });

  // Sandbox-function tool calls FK the view with RESTRICT, so their rows must go before the view.
  // Routed through the resource so the output GCS objects are deleted alongside the rows.
  await SandboxFunctionMCPActionResource.deleteAllForMCPServerViews(auth, {
    mcpServerViewIds,
    transaction,
  });
}
