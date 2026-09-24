import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import {
  deleteAgentDocument,
  deleteWorkspaceAgentDocuments,
  indexAgentDocument,
  updateAgentSearchActiveUsers,
} from "@app/lib/agent_search";
import { reindexGlobalAgents } from "@app/lib/agent_search/index_global";
import { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { fetchSearchActiveUsers } from "@app/lib/search_usage/usage";
import {
  deleteSkillDocument,
  deleteWorkspaceSkillDocuments,
  indexSkillDocument,
  updateSkillSearchActiveUsers,
} from "@app/lib/skill_search";
import { reindexCodeDefinedSkills } from "@app/lib/skill_search/index_code_defined";
import { deleteUserDocument, indexUserDocument } from "@app/lib/user_search";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function indexUserSearchActivity({
  userId,
}: {
  userId: string;
}): Promise<void> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn({ userId }, `[user_search] User not found (likely scrubbed)`);
    return;
  }

  // Get all memberships for this user
  const { memberships } = await MembershipResource.getLatestMemberships({
    users: [user],
  });
  const workspaces = await WorkspaceResource.fetchByModelIds([
    ...new Set(memberships.map((m) => m.workspaceId)),
  ]);
  const workspaceByModelId = new Map(
    workspaces.map((workspace) => [workspace.id, workspace])
  );

  // Process each membership
  for (const membership of memberships) {
    const workspace = workspaceByModelId.get(membership.workspaceId);
    if (!workspace) {
      logger.warn(
        { membershipId: membership.id, workspaceId: membership.workspaceId },
        `[user_search] Failed to retrieve workspace (likely scrubbed)`
      );
      continue;
    }

    if (membership.isRevoked()) {
      // If we didn't find the workspace (scrubbed) or membership is revoked, remove user from index
      const deleteResult = await deleteUserDocument({
        workspaceId: workspace.sId,
        userId: user.sId,
      });
      if (deleteResult.isErr()) {
        // Log but don't fail - user might not be in index
        logger.warn(
          {
            userId: user.sId,
            workspaceId: workspace.sId,
            error: deleteResult.error,
          },
          `[user_search] Failed to de-index user for workspace`
        );
      }
    } else {
      // Membership is active, index user in this workspace
      const document = user.toUserSearchDocument(
        renderLightWorkspaceType({ workspace, role: membership.role })
      );
      const indexResult = await indexUserDocument(document);
      if (indexResult.isErr()) {
        logger.error(
          {
            userId: user.sId,
            workspaceId: workspace.sId,
            error: indexResult.error,
          },
          `[user_search] Failed to index user for workspace`
        );
        throw new Error(
          `Failed to index user ${user.sId} in workspace ${workspace.sId}: ${indexResult.error.message}`
        );
      }
    }
  }
}

/**
 * @cc [owner:aubin-tchoi,label:backend;security] searchable-skill-index-projection
 * Index active or archived custom skills, including those the internal admin cannot read.
 */
export async function indexSkillSearchActivity({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const skill = await SkillResource.fetchById(auth, skillId, {
    permissionFiltering: "redact_unreadable",
    withInstructions: false,
    withTools: true,
    withFileAttachments: false,
  });
  // Suggested skills are not indexed: they have only been suggested and are not
  // ready to be used yet.
  if (!skill || skill.status === "suggested") {
    return;
  }

  const editors = await skill.listEditors(auth);
  const childSkillIds = await SkillResource.batchFetchChildSkillIds(auth, [
    skill,
  ]);
  let lastEditor = null;
  if (skill.editedBy) {
    lastEditor = await UserResource.fetchByModelId(skill.editedBy);
  }
  const document = skill.toSearchDocument(auth, {
    editors: editors ?? [],
    childSkillIds: childSkillIds.get(skill.sId) ?? [],
    lastEditedByUser: lastEditor,
    activeUsersCount: 0,
  });
  const result = await indexSkillDocument(document);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function deleteSkillSearchActivity({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  const deleteResult = await deleteSkillDocument({ workspaceId, skillId });
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }
}

export async function deleteWorkspaceSkillSearchActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const deleteResult = await deleteWorkspaceSkillDocuments({ workspaceId });
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }
}

/**
 * @cc [owner:sfriquet,label:backend;security] searchable-agent-index-projection
 * Index custom agents that are out of the builder, including those the internal admin cannot read.
 */
export async function indexAgentSearchActivity({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const agent = await AgentResource.fetchById(auth, agentId);
  // Global agents are code-defined, and draft and pending agents are not indexed: they only exist
  // inside the builder, behind its "try" button or before the first save.
  if (
    !agent ||
    agent.scope === "global" ||
    agent.status === "draft" ||
    agent.status === "pending"
  ) {
    return;
  }

  const editors = await agent.listEditors(auth);
  const skills = await agent.listSkills(auth, {
    permissionFiltering: "redact_unreadable",
  });
  const tagsByConfigurationId = await TagResource.listForAgents(auth, [
    agent.agentConfigurationModelId,
  ]);
  const actionsByConfigurationId = await fetchMCPServerActionConfigurations(
    auth,
    {
      configurationModelIds: [agent.agentConfigurationModelId],
      variant: "full",
    }
  );
  const feedback =
    await AgentMessageFeedbackResource.getFeedbackCountForAssistant(
      auth,
      agent.sId
    );
  const favoriteCount = await agent.countFavorites(auth);

  const lastEditedByUser = agent.versionAuthorId
    ? await UserResource.fetchByModelId(agent.versionAuthorId)
    : null;

  const document = agent.toSearchDocument(auth, {
    activeUsersCount: null,
    editors: editors ?? [],
    favoriteCount,
    feedbackNegativeCount: feedback.negative,
    feedbackPositiveCount: feedback.positive,
    lastEditedByUser,
    mcpServerViewIds: (
      actionsByConfigurationId.get(agent.agentConfigurationModelId) ?? []
    )
      .filter(isServerSideMCPServerConfiguration)
      .map((action) => action.mcpServerViewId),
    skillIds: skills.map((skill) => skill.sId),
    tagIds: (tagsByConfigurationId[agent.agentConfigurationModelId] ?? []).map(
      (tag) => tag.sId
    ),
  });

  const result = await indexAgentDocument(document);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function deleteAgentSearchActivity({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<void> {
  const deleteResult = await deleteAgentDocument({ workspaceId, agentId });
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }
}

export async function deleteWorkspaceAgentSearchActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const deleteResult = await deleteWorkspaceAgentDocuments({ workspaceId });
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }
}

export async function reindexCodeDefinedSkillsActivity(): Promise<void> {
  const result = await reindexCodeDefinedSkills();
  if (result.isErr()) {
    throw result.error;
  }
  logger.info(result.value, "Code-defined skill search index updated");
}

export async function reindexGlobalAgentsActivity(): Promise<void> {
  const result = await reindexGlobalAgents();
  if (result.isErr()) {
    throw result.error;
  }
  logger.info(result.value, "Global agent search index updated");
}

export async function listWorkspaceIdsActivity(): Promise<string[]> {
  const workspaces = await WorkspaceResource.listAll("ASC");
  const subscriptions =
    await SubscriptionResource.fetchActiveByWorkspacesModelId(
      workspaces.map((workspace) => workspace.id)
    );
  return workspaces
    .filter((workspace) => subscriptions[workspace.id].status === "active")
    .map((workspace) => workspace.sId);
}

/**
 * @cc [owner:sfriquet,label:backend;product] search-usage-refresh-coverage
 * Sets `active_users_count` on the existing search document of every indexed skill and agent of
 * the workspace (see `searchable-skill-index-projection` and `searchable-agent-index-projection`),
 * including those the internal admin cannot read. A skill or agent with no usage in the window
 * MUST be reset to 0. A skill or agent without a search document MUST be skipped, never created.
 * Any other usage fetch or update failure MUST be thrown so Temporal retries.
 */
export async function refreshWorkspaceSearchUsageActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const evaluatedAtMs = Date.now();
  const activeUsers = await fetchSearchActiveUsers(auth, {
    dimension: "skill",
    evaluatedAtMs,
  });
  if (activeUsers.isErr()) {
    throw activeUsers.error;
  }
  const skills = await SkillResource.listByWorkspace(auth, {
    permissionFiltering: "redact_unreadable",
    status: ["active", "archived"],
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });
  const updated = await updateSkillSearchActiveUsers({
    workspaceId,
    skills,
    activeUsers: activeUsers.value,
  });
  if (updated.isErr()) {
    throw updated.error;
  }

  const agentActiveUsers = await fetchSearchActiveUsers(auth, {
    dimension: "agent",
    evaluatedAtMs,
  });
  if (agentActiveUsers.isErr()) {
    throw agentActiveUsers.error;
  }
  const agents = await AgentResource.listByWorkspace(auth, {
    status: ["active", "archived"],
  });
  const agentsUpdated = await updateAgentSearchActiveUsers({
    workspaceId,
    agentIds: agents.map((agent) => agent.sId),
    activeUsers: agentActiveUsers.value,
  });
  if (agentsUpdated.isErr()) {
    throw agentsUpdated.error;
  }
}
