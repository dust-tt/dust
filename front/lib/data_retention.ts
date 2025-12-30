import assert from "assert";
import isNumber from "lodash/isNumber";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataRetentionModel } from "@app/lib/models/agent/agent_data_retention";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  WORKSPACE_DEFAULT_RETENTION_DAYS,
  WORKSPACE_RETENTION_MAX_DAYS,
  WORKSPACE_RETENTION_MIN_DAYS,
} from "@app/temporal/scrub_workspace/config";
import type { Result, WorkspaceType } from "@app/types";

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

export const isValidWorkspaceRetentionDays = (
  retentionDays: string | number | boolean | object | undefined
): retentionDays is number => {
  return (
    isNumber(retentionDays) &&
    retentionDays >= WORKSPACE_RETENTION_MIN_DAYS &&
    retentionDays <= WORKSPACE_RETENTION_MAX_DAYS
  );
};

export const getWorkspaceDataRetention = async (
  auth: Authenticator
): Promise<number> => {
  const workspace = auth.getNonNullableWorkspace();
  const customRetention = workspace.metadata?.workspaceRetentionDays;

  if (isValidWorkspaceRetentionDays(customRetention)) {
    return customRetention;
  }
  return WORKSPACE_DEFAULT_RETENTION_DAYS;
};

export const saveWorkspaceRetentionDaysMetadata = async (
  workspace: WorkspaceType,
  retentionDays: number
): Promise<Result<void, Error>> => {
  const metadata = { ...workspace.metadata };
  return WorkspaceResource.updateMetadata(workspace.id, {
    ...metadata,
    workspaceRetentionDays: retentionDays,
  });
};

export const deleteWorkspaceRetentionDaysMetadata = async (
  workspace: WorkspaceType
): Promise<Result<void, Error>> => {
  const metadata = { ...workspace.metadata };
  const entries = Object.entries(metadata ?? {}).filter(
    (entry): entry is [string, string | number | boolean | object] =>
      entry[0] !== "workspaceRetentionDays" && entry[1] !== undefined
  );
  return WorkspaceResource.updateMetadata(
    workspace.id,
    entries.length > 0 ? Object.fromEntries(entries) : null
  );
};
