import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { indexAgentDocument } from "@app/lib/agent_search";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { indexSkillDocument } from "@app/lib/skill_search";
import { indexUserDocument } from "@app/lib/user_search";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";

const SKILL_SEARCH_INDEX_CONCURRENCY = 10;
const AGENT_SEARCH_INDEX_CONCURRENCY = 10;

export async function recreateUserSearchIndex({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const localLogger = logger.child({
    workspaceId,
  });

  localLogger.info("[User Search] Recreating user search index for workspace.");

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  // Get all memberships for this workspace.
  const { memberships } = await MembershipResource.getLatestMemberships({
    workspace: lightWorkspace,
  });

  // Filter out revoked memberships - only index active members.
  const activeMemberships = memberships.filter((m) => !m.isRevoked());

  localLogger.info(
    {
      totalMemberships: memberships.length,
      activeMemberships: activeMemberships.length,
    },
    "[User Search] Found memberships to index"
  );

  let successCount = 0;
  let errorCount = 0;
  const users = await UserResource.fetchByModelIds([
    ...new Set(activeMemberships.map((m) => m.userId)),
  ]);
  const userByModelId = new Map(users.map((user) => [user.id, user]));

  await concurrentExecutor(
    activeMemberships,
    async (membership) => {
      const user = userByModelId.get(membership.userId);
      if (!user) {
        localLogger.warn(
          {
            membershipId: membership.id,
            userId: membership.userId,
          },
          "[User Search] User not found for membership"
        );
        errorCount++;
        return;
      }

      const document = user.toUserSearchDocument(lightWorkspace);
      const result = await indexUserDocument(document);

      if (result.isErr()) {
        localLogger.error(
          {
            userId: user.sId,
            error: result.error,
          },
          "[User Search] Failed to index user document"
        );
        errorCount++;
      } else {
        successCount++;
      }
    },
    { concurrency: 10 }
  );

  localLogger.info(
    {
      successCount,
      errorCount,
      totalIndexed: activeMemberships.length,
    },
    "[User Search] Completed user search index recreation for workspace"
  );

  if (errorCount > 0) {
    throw new Error(
      `Failed to index ${errorCount} users for workspace ${workspaceId}`
    );
  }
}

export async function recreateSkillSearchIndex({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const localLogger = logger.child({ workspaceId });
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  localLogger.info(
    "[Skill Search] Recreating skill search index for workspace."
  );

  const skills = await SkillResource.listByWorkspace(auth, {
    permissionFiltering: "redact_unreadable",
    status: ["active", "archived"],
    onlyCustom: true,
    withInstructions: false,
    withTools: true,
    withFileAttachments: false,
  });
  const editorsBySkillId = await SkillResource.batchListEditors(auth, skills);
  const childSkillIds = await SkillResource.batchFetchChildSkillIds(
    auth,
    skills
  );
  const lastEditors = await UserResource.fetchByModelIds(
    uniq(removeNulls(skills.map((skill) => skill.editedBy)))
  );
  const lastEditorByModelId = new Map(
    lastEditors.map((user) => [user.id, user])
  );
  const results = await concurrentExecutor(
    skills,
    async (skill) => {
      const document = skill.toSearchDocument(auth, {
        editors: editorsBySkillId.get(skill.sId) ?? [],
        childSkillIds: childSkillIds.get(skill.sId) ?? [],
        lastEditedByUser:
          skill.editedBy === null
            ? null
            : (lastEditorByModelId.get(skill.editedBy) ?? null),
        activeUsersCount: 0,
      });
      const result = await indexSkillDocument(document);
      if (result.isErr()) {
        localLogger.error(
          { error: result.error, skillId: document.skill_id },
          "[Skill Search] Failed to index skill document"
        );
      }
      return result.isOk();
    },
    { concurrency: SKILL_SEARCH_INDEX_CONCURRENCY }
  );
  const indexedCount = results.filter(Boolean).length;
  const errorCount = results.length - indexedCount;

  localLogger.info(
    { errorCount, indexedCount },
    "[Skill Search] Completed skill search index recreation for workspace"
  );

  if (errorCount > 0) {
    throw new Error(
      `Failed to index ${errorCount} skills for workspace ${workspaceId}`
    );
  }
}

export async function recreateAgentSearchIndex({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const localLogger = logger.child({ workspaceId });
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  localLogger.info(
    "[Agent Search] Recreating agent search index for workspace."
  );

  // The admin internal view only reports active agents, so archived ones are listed separately.
  const [activeConfigurations, archivedConfigurations] = await Promise.all([
    getAgentConfigurationsForView({
      auth,
      agentsGetView: "admin_internal",
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    }),
    getAgentConfigurationsForView({
      auth,
      agentsGetView: "archived",
      variant: "light",
    }),
  ]);
  // Same projection as `indexAgentSearchActivity`: global agents are code-defined, and draft and
  // pending agents only exist inside the builder.
  const agentIds = uniq(
    [...activeConfigurations, ...archivedConfigurations]
      .filter(
        (agent) =>
          agent.scope !== "global" &&
          agent.status !== "draft" &&
          agent.status !== "pending"
      )
      .map((agent) => agent.sId)
  );
  const agents = await AgentResource.fetchByIds(auth, agentIds);
  const configurationModelIds = agents.map(
    (agent) => agent.agentConfigurationModelId
  );
  const configurationModelIdSet = new Set(configurationModelIds);

  const [
    editorsByAgentId,
    tagsByConfigurationId,
    actionsByConfigurationId,
    feedbackCounts,
    lastEditors,
    agentSkills,
    favoriteCountByAgentId,
  ] = await Promise.all([
    AgentResource.batchListEditors(auth, agents),
    TagResource.listForAgents(auth, configurationModelIds),
    fetchMCPServerActionConfigurations(auth, {
      configurationModelIds,
      variant: "full",
    }),
    AgentMessageFeedbackResource.getFeedbackCountForAssistants(auth, agentIds),
    UserResource.fetchByModelIds(
      uniq(removeNulls(agents.map((agent) => agent.versionAuthorId)))
    ),
    SkillResource.listByAgentConfigurations(
      auth,
      [...activeConfigurations, ...archivedConfigurations].filter(
        (configuration) => configurationModelIdSet.has(configuration.id)
      ),
      { permissionFiltering: "redact_unreadable" }
    ),
    AgentResource.batchCountFavorites(auth, agents),
  ]);
  const lastEditorByModelId = new Map(
    lastEditors.map((user) => [user.id, user])
  );
  const skillIdsByConfigurationModelId = new Map<ModelId, string[]>();
  for (const { agentConfiguration, skill } of agentSkills) {
    const skillIds =
      skillIdsByConfigurationModelId.get(agentConfiguration.id) ?? [];
    skillIds.push(skill.sId);
    skillIdsByConfigurationModelId.set(agentConfiguration.id, skillIds);
  }
  const feedbackByAgentId = new Map<
    string,
    { positive: number; negative: number }
  >();
  for (const {
    agentConfigurationId,
    thumbDirection,
    count,
  } of feedbackCounts) {
    const feedback = feedbackByAgentId.get(agentConfigurationId) ?? {
      positive: 0,
      negative: 0,
    };
    switch (thumbDirection) {
      case "up":
        feedback.positive += count;
        break;
      case "down":
        feedback.negative += count;
        break;
      default:
        assertNever(thumbDirection);
    }
    feedbackByAgentId.set(agentConfigurationId, feedback);
  }

  const results = await concurrentExecutor(
    agents,
    async (agent) => {
      const feedback = feedbackByAgentId.get(agent.sId) ?? {
        positive: 0,
        negative: 0,
      };
      const document = agent.toSearchDocument(auth, {
        activeUsersCount: null,
        editors: editorsByAgentId.get(agent.sId) ?? [],
        favoriteCount: favoriteCountByAgentId.get(agent.sId) ?? 0,
        feedbackNegativeCount: feedback.negative,
        feedbackPositiveCount: feedback.positive,
        lastEditedByUser:
          agent.versionAuthorId === null
            ? null
            : (lastEditorByModelId.get(agent.versionAuthorId) ?? null),
        mcpServerViewIds: (
          actionsByConfigurationId.get(agent.agentConfigurationModelId) ?? []
        )
          .filter(isServerSideMCPServerConfiguration)
          .map((action) => action.mcpServerViewId),
        skillIds:
          skillIdsByConfigurationModelId.get(agent.agentConfigurationModelId) ??
          [],
        tagIds: (
          tagsByConfigurationId[agent.agentConfigurationModelId] ?? []
        ).map((tag) => tag.sId),
      });
      const result = await indexAgentDocument(document);
      if (result.isErr()) {
        localLogger.error(
          { error: result.error, agentId: document.agent_id },
          "[Agent Search] Failed to index agent document"
        );
      }
      return result.isOk();
    },
    { concurrency: AGENT_SEARCH_INDEX_CONCURRENCY }
  );
  const indexedCount = results.filter(Boolean).length;
  const errorCount = results.length - indexedCount;

  localLogger.info(
    { errorCount, indexedCount },
    "[Agent Search] Completed agent search index recreation for workspace"
  );

  if (errorCount > 0) {
    throw new Error(
      `Failed to index ${errorCount} agents for workspace ${workspaceId}`
    );
  }
}
