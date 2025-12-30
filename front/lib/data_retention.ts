import assert from "assert";
import isNumber from "lodash/isNumber";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataRetentionModel } from "@app/lib/models/agent/agent_data_retention";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WORKSPACE_DEFAULT_RETENTION_DAYS } from "@app/temporal/scrub_workspace/config";

export type DataRetentionConfig = {
  workspace: number;
  conversations: number | null;
  agents: Record<string, number>;
};

export const getConversationsDataRetention = async (
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

export const getWorkspaceDataRetention = async (
  auth: Authenticator
): Promise<number> => {
  const workspace = auth.getNonNullableWorkspace();
  const customRetention = workspace.metadata?.workspaceRetentionDays;

  if (
    isNumber(customRetention) &&
    customRetention >= 7 &&
    customRetention <= 1000
  ) {
    return customRetention;
  }
  return WORKSPACE_DEFAULT_RETENTION_DAYS;
};
