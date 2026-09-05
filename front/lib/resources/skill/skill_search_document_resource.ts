import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { Transaction } from "sequelize";
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
          "icon",
          "editedBy",
          "requestedSpaceIds",
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

      const editorGrantUserIdsBySkillModelId =
        await SkillResource.batchListEditorGrantUserIdsByModelId(
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
          icon: skill.icon,
          edited_by: skill.editedBy,
          editor_user_ids: [
            ...new Set(editorGrantUserIdsBySkillModelId.get(skill.id) ?? []),
          ].sort((a, b) => a - b),
          requested_space_ids: requestedSpaceIds,
          non_pod_space_ids: nonPodSpaceIds,
          non_pod_space_count: nonPodSpaceIds.length,
          pod_space_id: podSpaceIds[0] ?? null,
          updated_at: skill.updatedAt.toISOString(),
        });
      }

      return removeNulls(
        parsedSkillIds.map(({ skillId, skillModelId }) => {
          const document = documentBySkillModelId.get(skillModelId);
          return document?.skill_id === skillId ? document : null;
        })
      );
    }, existingTransaction);
  }
}
