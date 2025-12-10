import assert from "assert";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataRetentionModel } from "@app/lib/models/agent/agent_data_retention";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

export const getWorkspaceDataRetention = async (
  auth: Authenticator
): Promise<number | null> => {
  const workspace = auth.getNonNullableWorkspace();

  // We go through the workspace resource because we don't want to expose the retention in workspace type.
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  assert(workspaceResource, "Workspace not found");

  return workspaceResource.conversationsRetentionDays;
};

export const getAgentsDataRetention = async (
  auth: Authenticator
): Promise<Record<string, number>> => {
  const workspace = auth.getNonNullableWorkspace();

  const agentRetentions = await AgentDataRetentionModel.findAll({
    where: { workspaceId: workspace.id },
  });

  return agentRetentions.reduce<Record<string, number>>((acc, retention) => {
    acc[retention.agentConfigurationId] = retention.retentionDays;
    return acc;
  }, {});
};
