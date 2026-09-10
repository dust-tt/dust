import type { Authenticator } from "@app/lib/auth";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { SkillSearchPermissionFiltering } from "@app/types/api/skills";
import { isDefaultFromAvailability } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import { SkillSearchMetadataSchema } from "@app/types/skill_search/skill_search";
import assert from "assert";
import groupBy from "lodash/groupBy";
import isEqual from "lodash/isEqual";
import type { WhereOptions } from "sequelize";
import { Op, Transaction } from "sequelize";

interface TransactionOptions {
  transaction?: Transaction;
}

interface ParsedSkillId {
  skillId: string;
  skillModelId: ModelId;
}

/**
 * Builds and validates skill-search documents from canonical database state.
 * This projector performs database reads only; index writes run after committed mutations.
 */
export class SkillSearchDocumentResource {
  /**
   * @cc [owner:aubin-tchoi,label:security] canonical-skill-search-authorization
   * Strict results must pass live editor, row and all-space checks and match indexed permissions;
   * only admins may retain unreadable resources through canonical metadata redaction.
   */
  static async authorizeSearchDocuments(
    auth: Authenticator,
    candidates: SkillSearchDocument[],
    permissionFiltering: SkillSearchPermissionFiltering = "strict"
  ): Promise<Map<string, SkillResource>> {
    assert(permissionFiltering !== "redact_unreadable" || auth.isAdmin());
    const workspace = auth.getNonNullableWorkspace();
    const scoped = candidates.filter((candidate) => {
      const parsed = getResourceNameAndIdFromSId(candidate.skill_id);
      return (
        candidate.workspace_id === workspace.sId &&
        parsed?.resourceName === "skill" &&
        parsed.workspaceModelId === workspace.id
      );
    });
    if (permissionFiltering === "redact_unreadable") {
      const resources = await SkillResource.fetchByIds(
        auth,
        scoped.map((candidate) => candidate.skill_id),
        {
          onlyActive: true,
          permissionFiltering,
          withInstructions: false,
          withTools: false,
          withFileAttachments: false,
        }
      );
      return new Map(resources.map((resource) => [resource.sId, resource]));
    }
    const canEditAllSkills =
      auth.getResourceIdsWithVerb("skill", "write").kind === "all";
    const callerGroups = new Set(auth.groupModelIds());
    const editorFiltered = scoped.filter((candidate) => {
      if (candidate.availability !== "editors" || auth.isKey()) {
        return true;
      }
      const user = auth.user();
      const parsed = getResourceNameAndIdFromSId(candidate.skill_id);
      return (
        user !== null &&
        (canEditAllSkills ||
          (Array.isArray(candidate.editor_user_ids) &&
            candidate.editor_user_ids.includes(user.id)) ||
          (Array.isArray(candidate.editor_group_ids) &&
            candidate.editor_group_ids.some((id) => callerGroups.has(id)))) &&
        parsed !== null &&
        auth.getGrantedVerbs("skill", parsed.resourceModelId).includes("write")
      );
    });
    const visible = await this.filterSearchDocumentsByCurrentState(
      auth,
      editorFiltered
    );
    return new Map(
      visible.map((document) => [
        document.skill_id,
        SkillResource.fromSearchDocument(auth, document, { canRead: true }),
      ])
    );
  }

  private static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("skill", { id, workspaceId });
  }

  private static parseSkillIds(
    auth: Authenticator,
    skillIds: readonly string[]
  ): ParsedSkillId[] {
    const workspace = auth.getNonNullableWorkspace();

    return removeNulls(
      skillIds.map((skillId) => {
        const parsed = getResourceNameAndIdFromSId(skillId);
        if (
          parsed?.resourceName !== "skill" ||
          parsed.workspaceModelId !== workspace.id
        ) {
          return null;
        }

        return { skillId, skillModelId: parsed.resourceModelId };
      })
    );
  }

  static async listActiveSearchIndexSkillIds(
    auth: Authenticator,
    {
      afterSkillModelId,
      limit,
      transaction: existingTransaction,
    }: {
      afterSkillModelId: ModelId | null;
      limit: number;
      transaction?: Transaction;
    }
  ): Promise<{ skillId: string; skillModelId: ModelId }[]> {
    assert(Number.isInteger(limit) && limit > 0, "limit must be positive");

    return withTransaction(async (transaction) => {
      const workspace = auth.getNonNullableWorkspace();
      const where: WhereOptions<SkillConfigurationModel> = {
        workspaceId: workspace.id,
        status: "active",
      };
      if (afterSkillModelId !== null) {
        where.id = { [Op.gt]: afterSkillModelId };
      }

      const skills = await SkillConfigurationModel.findAll({
        attributes: ["id"],
        where,
        order: [["id", "ASC"]],
        limit,
        transaction,
      });

      return skills.map((skill) => ({
        skillId: this.modelIdToSId({
          id: skill.id,
          workspaceId: workspace.id,
        }),
        skillModelId: skill.id,
      }));
    }, existingTransaction);
  }

  static async fetchSearchDocument(
    auth: Authenticator,
    skillId: string,
    options: TransactionOptions = {}
  ): Promise<SkillSearchDocument | null> {
    const [document] = await this.fetchSearchDocuments(
      auth,
      [skillId],
      options
    );
    return document ?? null;
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend] committed-search-projection
   * An independently hydrated document reads its row and relations in one repeatable-read
   * snapshot; callers supplying a transaction own that transaction's consistency boundary.
   */
  static async fetchSearchDocuments(
    auth: Authenticator,
    skillIds: readonly string[],
    { transaction: existingTransaction }: TransactionOptions = {}
  ): Promise<SkillSearchDocument[]> {
    const parsedSkillIds = this.parseSkillIds(auth, skillIds);
    if (parsedSkillIds.length === 0) {
      return [];
    }

    return withTransaction(
      async (transaction) => {
        const workspace = auth.getNonNullableWorkspace();
        const skillModelIds = [
          ...new Set(parsedSkillIds.map(({ skillModelId }) => skillModelId)),
        ];
        const skills = await SkillConfigurationModel.findAll({
          attributes: [
            "id",
            "status",
            "availability",
            "name",
            "userFacingDescription",
            "agentFacingDescription",
            "source",
            "sourceMetadata",
            "reinforcement",
            "lastReinforcementAnalysisAt",
            "selfImprovementLock",
            "selfImprovementCostsCapMicroUsd",
            "selfImprovementCostsCapAwuCredits",
            "manuallyRequestedSpaceIds",
            "createdAt",
            "icon",
            "editedBy",
            "requestedSpaceIds",
            "favoriteCount",
            "updatedAt",
          ],
          where: {
            id: { [Op.in]: skillModelIds },
            workspaceId: workspace.id,
            status: "active",
          },
          transaction,
        });
        if (skills.length === 0) {
          return [];
        }

        const activeSkillModelIds = skills.map((skill) => skill.id);
        const toolConfigurations =
          await SkillMCPServerConfigurationModel.findAll({
            attributes: ["skillConfigurationId", "mcpServerViewId"],
            where: {
              workspaceId: workspace.id,
              skillConfigurationId: { [Op.in]: activeSkillModelIds },
            },
            transaction,
          });
        const toolsBySkillModelId = groupBy(
          toolConfigurations,
          "skillConfigurationId"
        );

        const requestedSpaceModelIds = [
          ...new Set(skills.flatMap((skill) => skill.requestedSpaceIds)),
        ];
        const requestedSpaces = await SpaceResource.fetchByIds(
          auth,
          requestedSpaceModelIds.map((id) =>
            SpaceResource.modelIdToSId({ id, workspaceId: workspace.id })
          ),
          { transaction }
        );
        const requestedSpaceByModelId = new Map(
          requestedSpaces.map((space) => [space.id, space])
        );

        const editorGrantsBySkillModelId =
          await SkillResource.batchListSearchEditorGrants(
            auth,
            activeSkillModelIds,
            { transaction }
          );

        const documentBySkillModelId = new Map<ModelId, SkillSearchDocument>();
        for (const skill of skills) {
          if (
            new Set(skill.requestedSpaceIds).size !==
            skill.requestedSpaceIds.length
          ) {
            continue;
          }

          const spaces = removeNulls(
            skill.requestedSpaceIds.map((spaceModelId) =>
              requestedSpaceByModelId.get(spaceModelId)
            )
          );
          if (spaces.length !== skill.requestedSpaceIds.length) {
            continue;
          }

          const requestedSpaceIds = skill.requestedSpaceIds.map(
            (spaceModelId) =>
              SpaceResource.modelIdToSId({
                id: spaceModelId,
                workspaceId: workspace.id,
              })
          );
          documentBySkillModelId.set(skill.id, {
            workspace_id: workspace.sId,
            skill_id: this.modelIdToSId({
              id: skill.id,
              workspaceId: workspace.id,
            }),
            status: skill.status,
            availability: skill.availability,
            name: skill.name,
            description: skill.userFacingDescription,
            icon: skill.icon,
            edited_by: skill.editedBy,
            editor_user_ids:
              editorGrantsBySkillModelId.get(skill.id)?.userIds ?? [],
            editor_group_ids:
              editorGrantsBySkillModelId.get(skill.id)?.groupIds ?? [],
            requested_space_ids: requestedSpaceIds,
            tools: [
              ...new Set(
                (toolsBySkillModelId[skill.id] ?? []).map((tool) =>
                  MCPServerViewResource.modelIdToSId({
                    id: tool.mcpServerViewId,
                    workspaceId: workspace.id,
                  })
                )
              ),
            ].sort(),
            // Initialized on insert; normal reindexing preserves the daily usage snapshot.
            active_users: 0,
            favorite_count: skill.favoriteCount,
            is_default: isDefaultFromAvailability(skill.availability),
            updated_at: skill.updatedAt.toISOString(),
            metadata: {
              createdAt: skill.createdAt.getTime(),
              agentFacingDescription: skill.agentFacingDescription,
              source: skill.source,
              sourceMetadata: skill.sourceMetadata,
              reinforcement: skill.reinforcement,
              lastReinforcementAnalysisAt:
                skill.lastReinforcementAnalysisAt?.toISOString() ?? null,
              selfImprovementLock: skill.selfImprovementLock,
              selfImprovementCostsCapMicroUsd:
                skill.selfImprovementCostsCapMicroUsd,
              selfImprovementCostsCapAwuCredits:
                skill.selfImprovementCostsCapAwuCredits,
              manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds.map(
                (id) =>
                  SpaceResource.modelIdToSId({ id, workspaceId: workspace.id })
              ),
            },
          });
        }

        return removeNulls(
          parsedSkillIds.map(({ skillId, skillModelId }) => {
            const document = documentBySkillModelId.get(skillModelId);
            return document?.skill_id === skillId ? document : null;
          })
        );
      },
      existingTransaction,
      { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }
    );
  }

  /**
   * Fail closed when an Elasticsearch document's permission-bearing fields no
   * longer match the canonical database state.
   */
  static async filterSearchDocumentsByCurrentState(
    auth: Authenticator,
    documents: readonly SkillSearchDocument[],
    options: TransactionOptions = {}
  ): Promise<SkillSearchDocument[]> {
    if (documents.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();
    const currentDocuments = await this.fetchSearchDocuments(
      auth,
      documents.map((document) => document.skill_id),
      options
    );
    const currentDocumentBySkillId = new Map(
      currentDocuments.map((document) => [document.skill_id, document])
    );

    return documents.flatMap((document) => {
      const currentDocument = currentDocumentBySkillId.get(document.skill_id);
      const parsedSkillId = getResourceNameAndIdFromSId(document.skill_id);
      const matches =
        document.workspace_id === workspace.sId &&
        currentDocument !== undefined &&
        parsedSkillId?.resourceName === "skill" &&
        SkillResource.canReadRow(auth, {
          id: parsedSkillId.resourceModelId,
          workspaceId: workspace.id,
        }) &&
        document.status === currentDocument.status &&
        document.availability === currentDocument.availability &&
        Array.isArray(document.requested_space_ids) &&
        isEqual(
          [...document.requested_space_ids].sort(),
          [...currentDocument.requested_space_ids].sort()
        ) &&
        currentDocument.requested_space_ids.every((spaceId) => {
          const parsed = getResourceNameAndIdFromSId(spaceId);
          return (
            parsed?.resourceName === "space" &&
            parsed.workspaceModelId === workspace.id &&
            auth
              .getGrantedVerbs("space", parsed.resourceModelId)
              .includes("read")
          );
        }) &&
        Array.isArray(document.editor_user_ids) &&
        isEqual(
          [...document.editor_user_ids].sort((a, b) => a - b),
          [...currentDocument.editor_user_ids].sort((a, b) => a - b)
        ) &&
        // Old documents can still match individual editors during the additive backfill.
        (document.editor_group_ids === undefined ||
          (Array.isArray(document.editor_group_ids) &&
            isEqual(
              [...document.editor_group_ids].sort((a, b) => a - b),
              [...(currentDocument.editor_group_ids ?? [])].sort(
                (a, b) => a - b
              )
            )));
      // Existing documents can be read during the additive metadata backfill. Authorization
      // always uses current state, and the fallback does not require another DB query.
      if (!matches || !currentDocument) {
        return [];
      }
      const metadata = SkillSearchMetadataSchema.safeParse(document.metadata);
      const validMetadata =
        metadata.success &&
        (metadata.data.manuallyRequestedSpaceIds ?? []).every((spaceId) => {
          const parsed = getResourceNameAndIdFromSId(spaceId);
          return (
            parsed?.resourceName === "space" &&
            parsed.workspaceModelId === workspace.id
          );
        });
      return [
        {
          ...document,
          metadata: validMetadata ? metadata.data : currentDocument.metadata,
        },
      ];
    });
  }
}
