import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import assert from "assert";
import isEqual from "lodash/isEqual";
import type { Transaction, WhereOptions } from "sequelize";
import { Op } from "sequelize";

interface TransactionOptions {
  transaction?: Transaction;
}

interface ParsedSkillId {
  skillId: string;
  skillModelId: ModelId;
}

/**
 * Builds and validates skill-search documents from canonical database state.
 * Elasticsearch and workflow side effects deliberately live outside Resources.
 */
export class SkillSearchDocumentResource {
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

    return skillIds.flatMap((skillId) => {
      const parsed = getResourceNameAndIdFromSId(skillId);
      if (
        parsed?.resourceName !== "skill" ||
        parsed.workspaceModelId !== workspace.id
      ) {
        return [];
      }

      return [{ skillId, skillModelId: parsed.resourceModelId }];
    });
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

  static async fetchSearchDocuments(
    auth: Authenticator,
    skillIds: readonly string[],
    { transaction: existingTransaction }: TransactionOptions = {}
  ): Promise<SkillSearchDocument[]> {
    const parsedSkillIds = this.parseSkillIds(auth, skillIds);
    if (parsedSkillIds.length === 0) {
      return [];
    }

    return withTransaction(async (transaction) => {
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
          "icon",
          "editedBy",
          "requestedSpaceIds",
          "createdAt",
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

      const editorGroupLinks = await GroupSkillModel.findAll({
        attributes: ["groupId", "skillConfigurationId"],
        where: {
          skillConfigurationId: { [Op.in]: activeSkillModelIds },
          workspaceId: workspace.id,
        },
        transaction,
      });
      const editorGroupModelIds = [
        ...new Set(editorGroupLinks.map((link) => link.groupId)),
      ];
      const editorGroups = await GroupResource.fetchByModelIds(
        auth,
        editorGroupModelIds,
        { transaction }
      );
      const editorGroupByModelId = new Map(
        editorGroups.map((group) => [group.id, group])
      );
      const editorGroupIdsBySkillModelId = new Map<ModelId, ModelId[]>();
      for (const link of editorGroupLinks) {
        const groupIds =
          editorGroupIdsBySkillModelId.get(link.skillConfigurationId) ?? [];
        editorGroupIdsBySkillModelId.set(link.skillConfigurationId, [
          ...groupIds,
          link.groupId,
        ]);
      }

      const documentBySkillModelId = new Map<ModelId, SkillSearchDocument>();
      for (const skill of skills) {
        if (
          new Set(skill.requestedSpaceIds).size !==
          skill.requestedSpaceIds.length
        ) {
          continue;
        }

        const spaces = skill.requestedSpaceIds.flatMap((spaceModelId) => {
          const space = requestedSpaceByModelId.get(spaceModelId);
          return space ? [space] : [];
        });
        if (spaces.length !== skill.requestedSpaceIds.length) {
          continue;
        }

        const podSpaceIds = [
          ...new Set(
            spaces
              .filter((space) => space.isProject())
              .map((space) => space.sId)
          ),
        ];
        if (podSpaceIds.length > 1) {
          continue;
        }

        const editorGroupIds = editorGroupIdsBySkillModelId.get(skill.id);
        if (editorGroupIds?.length !== 1) {
          continue;
        }
        const editorGroup = editorGroupByModelId.get(editorGroupIds[0]);
        if (editorGroup?.kind !== "skill_editors") {
          continue;
        }

        const requestedSpaceIds = skill.requestedSpaceIds.map((spaceModelId) =>
          SpaceResource.modelIdToSId({
            id: spaceModelId,
            workspaceId: workspace.id,
          })
        );
        const nonPodSpaceIds = [
          ...new Set(
            spaces
              .filter((space) => !space.isProject())
              .map((space) => space.sId)
          ),
        ];

        documentBySkillModelId.set(skill.id, {
          workspace_id: workspace.sId,
          skill_id: this.modelIdToSId({
            id: skill.id,
            workspaceId: workspace.id,
          }),
          status: skill.status,
          availability: skill.availability,
          name: skill.name,
          user_facing_description: skill.userFacingDescription,
          agent_facing_description: skill.agentFacingDescription,
          icon: skill.icon,
          edited_by: skill.editedBy,
          editor_group_id: editorGroup.sId,
          requested_space_ids: requestedSpaceIds,
          non_pod_space_ids: nonPodSpaceIds,
          non_pod_space_count: nonPodSpaceIds.length,
          pod_space_id: podSpaceIds[0] ?? null,
          created_at: skill.createdAt.toISOString(),
          updated_at: skill.updatedAt.toISOString(),
        });
      }

      return parsedSkillIds.flatMap(({ skillId, skillModelId }) => {
        const document = documentBySkillModelId.get(skillModelId);
        return document?.skill_id === skillId ? [document] : [];
      });
    }, existingTransaction);
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

    return documents.filter((document) => {
      const currentDocument = currentDocumentBySkillId.get(document.skill_id);
      return (
        document.workspace_id === workspace.sId &&
        currentDocument !== undefined &&
        document.status === currentDocument.status &&
        document.availability === currentDocument.availability &&
        isEqual(
          [...document.requested_space_ids].sort(),
          [...currentDocument.requested_space_ids].sort()
        ) &&
        isEqual(
          [...document.non_pod_space_ids].sort(),
          [...currentDocument.non_pod_space_ids].sort()
        ) &&
        document.non_pod_space_count === currentDocument.non_pod_space_count &&
        document.pod_space_id === currentDocument.pod_space_id &&
        document.editor_group_id === currentDocument.editor_group_id
      );
    });
  }
}
