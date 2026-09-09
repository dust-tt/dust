import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import {
  AgentConfigurationModel,
  AgentModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { SearchPermissionFiltering } from "@app/types/search";
import type { ModelId } from "@app/types/shared/model_id";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import groupBy from "lodash/groupBy";
import isEqual from "lodash/isEqual";
import { col, fn, Op, Transaction } from "sequelize";

export class AgentSearchDocumentResource {
  static async listSearchIndexAgentIds(
    auth: Authenticator,
    {
      afterAgentModelId,
      limit,
    }: { afterAgentModelId: ModelId | null; limit: number }
  ): Promise<{ agentId: string; agentModelId: ModelId }[]> {
    assert(Number.isInteger(limit) && limit > 0);
    const agents = await AgentModel.findAll({
      attributes: ["id", "sId"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        ...(afterAgentModelId !== null
          ? { id: { [Op.gt]: afterAgentModelId } }
          : {}),
      },
      order: [["id", "ASC"]],
      limit,
    });
    return agents.map((agent) => ({
      agentId: agent.sId,
      agentModelId: agent.id,
    }));
  }

  static async fetchSearchDocument(
    auth: Authenticator,
    agentId: string
  ): Promise<AgentSearchDocument | null> {
    const [document] = await this.fetchSearchDocuments(auth, [agentId]);
    return document ?? null;
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] latest-logical-agent-projection
   * Index only the latest active configuration of each workspace-owned stable agent, with its
   * relations read in one repeatable-read snapshot; never read or index instructions or tool secrets.
   */
  static async fetchSearchDocuments(
    auth: Authenticator,
    agentIds: readonly string[],
    { transaction: existingTransaction }: { transaction?: Transaction } = {}
  ): Promise<AgentSearchDocument[]> {
    if (agentIds.length === 0) {
      return [];
    }
    return withTransaction(
      async (transaction) => {
        const workspace = auth.getNonNullableWorkspace();
        const identities = await AgentModel.findAll({
          attributes: ["id", "sId"],
          where: { workspaceId: workspace.id, sId: [...new Set(agentIds)] },
          transaction,
        });
        if (identities.length === 0) {
          return [];
        }
        const identityByModelId = new Map(
          identities.map((agent) => [agent.id, agent.sId])
        );
        const latestVersions = await AgentConfigurationModel.findAll({
          attributes: ["agentId", [fn("MAX", col("version")), "version"]],
          where: {
            workspaceId: workspace.id,
            agentId: identities.map((agent) => agent.id),
          },
          group: ["agentId"],
          transaction,
        });
        if (latestVersions.length === 0) {
          return [];
        }
        const agents = await AgentConfigurationModel.findAll({
          attributes: [
            "id",
            "sId",
            "agentId",
            "workspaceId",
            "version",
            "status",
            "scope",
            "name",
            "description",
            "authorId",
            "pictureUrl",
            "requestedSpaceIds",
            "createdAt",
            "updatedAt",
            "providerId",
            "modelId",
            "temperature",
            "reasoningEffort",
            "responseFormat",
            "maxStepsPerRun",
            "templateId",
            "reinforcement",
            "lastReinforcementAnalysisAt",
          ],
          where: {
            workspaceId: workspace.id,
            status: "active",
            [Op.or]: latestVersions.map((agent) => ({
              agentId: agent.agentId,
              version: agent.version,
            })),
          },
          transaction,
        });
        if (agents.length === 0) {
          return [];
        }
        const configurationIds = agents.map((agent) => agent.id);
        const ids = agents.map((agent) => agent.sId);
        const requestedSpaceIds = [
          ...new Set(agents.flatMap((agent) => agent.requestedSpaceIds)),
        ];
        const spaces = await SpaceResource.fetchByIds(
          auth,
          requestedSpaceIds.map((id) =>
            SpaceResource.modelIdToSId({ id, workspaceId: workspace.id })
          ),
          { transaction }
        );
        const spaceIds = new Set(spaces.map((space) => space.id));
        const editors = await GroupResource.listAgentEditorUserIds(
          auth,
          configurationIds,
          { transaction }
        );
        const tools = await AgentMCPServerConfigurationModel.findAll({
          attributes: ["agentConfigurationId", "mcpServerViewId"],
          where: {
            workspaceId: workspace.id,
            agentConfigurationId: configurationIds,
          },
          transaction,
        });
        const toolsByConfigurationId = groupBy(tools, "agentConfigurationId");
        const skills = await AgentSkillModel.findAll({
          attributes: [
            "agentConfigurationId",
            "customSkillId",
            "globalSkillId",
          ],
          where: {
            workspaceId: workspace.id,
            agentConfigurationId: configurationIds,
          },
          transaction,
        });
        const skillsByConfigurationId = groupBy(skills, "agentConfigurationId");
        const tagsByConfigurationId = await TagResource.listForAgents(
          auth,
          configurationIds,
          { transaction }
        );
        const favoriteCounts = await AgentUserRelationModel.count({
          attributes: ["agentConfiguration"],
          group: ["agentConfiguration"],
          where: {
            workspaceId: workspace.id,
            agentConfiguration: ids,
            favorite: true,
          },
          transaction,
        });
        const favoriteCountById = new Map(
          favoriteCounts.flatMap((row) =>
            isString(row.agentConfiguration)
              ? [[row.agentConfiguration, row.count] as const]
              : []
          )
        );
        const feedbackCountById =
          await AgentMessageFeedbackResource.countByAgentIds(auth, ids, {
            transaction,
          });
        const documents = new Map<string, AgentSearchDocument>();
        for (const agent of agents) {
          const editorIds = editors.get(agent.id);
          const tags = tagsByConfigurationId[agent.id] ?? [];
          if (
            !editorIds ||
            identityByModelId.get(agent.agentId) !== agent.sId ||
            tags.some((tag) => !tag) ||
            (agent.scope !== "visible" && agent.scope !== "hidden") ||
            new Set(agent.requestedSpaceIds).size !==
              agent.requestedSpaceIds.length ||
            agent.requestedSpaceIds.some((id) => !spaceIds.has(id))
          ) {
            continue;
          }
          const serializedTags = tags.map((tag) => tag.toJSON());
          documents.set(agent.sId, {
            workspace_id: workspace.sId,
            agent_id: agent.sId,
            agent_model_id: agent.agentId,
            status: "active",
            availability:
              agent.scope === "visible" ? "workspace_users" : "editors",
            name: agent.name,
            description: agent.description,
            icon: agent.pictureUrl,
            edited_by: agent.authorId,
            editor_user_ids: [...new Set([agent.authorId, ...editorIds])].sort(
              (a, b) => a - b
            ),
            requested_space_ids: agent.requestedSpaceIds.map((id) =>
              SpaceResource.modelIdToSId({ id, workspaceId: workspace.id })
            ),
            tools: [
              ...new Set(
                (toolsByConfigurationId[agent.id] ?? []).map((tool) =>
                  MCPServerViewResource.modelIdToSId({
                    id: tool.mcpServerViewId,
                    workspaceId: workspace.id,
                  })
                )
              ),
            ].sort(),
            skills: [
              ...new Set(
                (skillsByConfigurationId[agent.id] ?? []).flatMap((skill) =>
                  skill.customSkillId !== null
                    ? [
                        SkillResource.modelIdToSId({
                          id: skill.customSkillId,
                          workspaceId: workspace.id,
                        }),
                      ]
                    : skill.globalSkillId
                      ? [skill.globalSkillId]
                      : []
                )
              ),
            ].sort(),
            tags: serializedTags.map((tag) => tag.sId).sort(),
            active_users: 0,
            favorite_count: favoriteCountById.get(agent.sId) ?? 0,
            feedbacks: feedbackCountById.get(agent.sId) ?? 0,
            updated_at: agent.updatedAt.toISOString(),
            metadata: {
              id: agent.id,
              version: agent.version,
              versionCreatedAt: agent.createdAt.toISOString(),
              model: AgentResource.toModelJSON(agent),
              maxStepsPerRun: agent.maxStepsPerRun,
              templateId: agent.templateId
                ? TemplateResource.modelIdToSId({ id: agent.templateId })
                : null,
              tags: serializedTags,
              reinforcement: agent.reinforcement,
              lastReinforcementAnalysisAt:
                agent.lastReinforcementAnalysisAt?.toISOString() ?? null,
            },
          });
        }
        return removeNulls(
          [...new Set(agentIds)].map((id) => documents.get(id) ?? null)
        );
      },
      existingTransaction,
      { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }
    );
  }

  /**
   * @cc [owner:aubin-tchoi,label:security] canonical-agent-search-authorization
   * Strict search rejects stale permissions and unreadable agents; only admins may retain
   * unreadable listing metadata. No search result ever includes instructions or capabilities.
   */
  static async authorizeSearchDocuments(
    auth: Authenticator,
    candidates: AgentSearchDocument[],
    permissionFiltering: SearchPermissionFiltering = "strict"
  ): Promise<Map<string, LightAgentConfigurationType>> {
    assert(permissionFiltering !== "redact_unreadable" || auth.isAdmin());
    const workspace = auth.getNonNullableWorkspace();
    const scoped = candidates.filter(
      (candidate) => candidate.workspace_id === workspace.sId
    );
    const current = await this.fetchSearchDocuments(
      auth,
      scoped.map((candidate) => candidate.agent_id)
    );
    const currentById = new Map(
      current.map((document) => [document.agent_id, document])
    );
    const results = new Map<string, LightAgentConfigurationType>();
    for (const candidate of scoped) {
      const document = currentById.get(candidate.agent_id);
      if (!document) {
        continue;
      }
      const canEdit =
        auth.user() !== null &&
        document.editor_user_ids.includes(auth.getNonNullableUser().id);
      const canRead =
        (document.availability !== "editors" || canEdit) &&
        document.requested_space_ids.every((id) => {
          const parsed = getResourceNameAndIdFromSId(id);
          return (
            parsed?.resourceName === "space" &&
            parsed.workspaceModelId === workspace.id &&
            auth
              .getGrantedVerbs("space", parsed.resourceModelId)
              .includes("read")
          );
        });
      if (
        permissionFiltering === "strict" &&
        (!canRead ||
          document.agent_model_id !== candidate.agent_model_id ||
          document.metadata.id !== candidate.metadata?.id ||
          document.availability !== candidate.availability ||
          !isEqual(document.editor_user_ids, candidate.editor_user_ids) ||
          !isEqual(document.requested_space_ids, candidate.requested_space_ids))
      ) {
        continue;
      }
      results.set(
        document.agent_id,
        this.toSearchJSON(document, { canRead, canEdit })
      );
    }
    return results;
  }

  static toSearchJSON(
    document: AgentSearchDocument,
    { canRead, canEdit }: { canRead: boolean; canEdit: boolean }
  ): LightAgentConfigurationType {
    return {
      ...document.metadata,
      sId: document.agent_id,
      name: document.name,
      description: document.description,
      pictureUrl: document.icon,
      versionAuthorId: document.edited_by,
      status: document.status,
      scope: document.availability === "editors" ? "hidden" : "visible",
      instructions: null,
      requestedGroupIds: [],
      requestedSpaceIds: document.requested_space_ids,
      userFavorite: false,
      canRead,
      canEdit,
    };
  }
}
