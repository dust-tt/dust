import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import { SkillReferenceModel } from "@app/lib/models/skill/skill_reference";
import { SkillSuggestionModel } from "@app/lib/models/skill/skill_suggestion";
import { FileResource } from "@app/lib/resources/file_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SKILL_EDITOR_GRANT_TYPE } from "@app/lib/resources/skill/skill_editors";
import { propagateReferenceUpdatesToParentSkills } from "@app/lib/resources/skill/skill_references";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import {
  launchDeleteSkillSearchWorkflow,
  launchDeleteWorkspaceSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function deleteSkill(
  resourceClass: typeof SkillResource,
  skillResource: SkillResource,
  auth: Authenticator
): Promise<Result<number, Error>> {
  if (!skillResource.canAdministrate(auth)) {
    return new Err(
      new Error("User does not have permission to delete this skill.")
    );
  }

  const workspace = auth.getNonNullableWorkspace();

  const whereWorkspaceIdAndSkillId = {
    skillConfigurationId: skillResource.id,
    workspaceId: workspace.id,
  };

  // Collect file IDs from current attachments and all version snapshots.
  const fileAttachmentRows = await SkillFileAttachmentModel.findAll({
    where: whereWorkspaceIdAndSkillId,
  });
  const currentFileIds = fileAttachmentRows.map((a) => a.fileId);

  const versionRows = await SkillVersionModel.findAll({
    where: whereWorkspaceIdAndSkillId,
    attributes: ["fileAttachmentIds"],
  });
  const versionFileIds = versionRows.flatMap((v) => v.fileAttachmentIds);

  const allFileIds = [...new Set([...currentFileIds, ...versionFileIds])];
  const filesToDelete = await FileResource.fetchByModelIdsWithAuth(
    auth,
    allFileIds
  );

  const { affectedCount, referencingSkillIds } = await withTransaction(
    async (transaction) => {
      const referencingSkillIds = await propagateReferenceUpdatesToParentSkills(
        resourceClass,
        skillResource,
        auth,
        {
          icon: skillResource.icon,
          name: skillResource.name,
          requestedSpaceIds: skillResource.requestedSpaceIds,
          status: "archived",
        },
        { transaction }
      );

      // Delete agent-skill associations.
      await AgentSkillModel.destroy({
        where: {
          customSkillId: skillResource.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

      await ProjectMetadataResource.removeSkillFromAllDefaultSkills(
        auth,
        skillResource.sId,
        transaction
      );

      // The per-user grant groups (see `writeEditorUserGrants`) exist only to hold this skill's
      // grants, so they go with the skill. Listed by resource rather than by grant so a skill
      // never leaves a grant group behind, and fetched before the grants are dropped, since the
      // grants are what identifies them.
      const grantGroups =
        await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
          resourceType: "skill",
          resourceId: skillResource.id,
          transaction,
        });

      // Drop the skill's instance grants before the groups go away: group_permissions rows are
      // keyed by both, and this also covers grants held by any other group.
      await GroupPermissionResource.deleteAllForResource(auth, {
        resourceType: "skill",
        resourceId: skillResource.id,
        transaction,
      });

      for (const grantGroup of grantGroups) {
        await grantGroup.delete(auth, { transaction });
      }

      await SkillFileAttachmentModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      await SkillDataSourceConfigurationModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      await SkillMCPServerConfigurationModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      await SkillSuggestionModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      await SkillVersionModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      await SkillReferenceModel.destroy({
        where: {
          workspaceId: workspace.id,
          parentSkillId: skillResource.id,
        },
        transaction,
      });

      await SkillReferenceModel.destroy({
        where: {
          workspaceId: workspace.id,
          childCustomSkillId: skillResource.id,
        },
        transaction,
      });

      const affectedCount = await skillResource.model.destroy({
        where: {
          id: skillResource.id,
          workspaceId: workspace.id,
        },
        transaction,
      });
      return {
        affectedCount,
        referencingSkillIds,
      };
    }
  );

  const deleteSearchResult = await launchDeleteSkillSearchWorkflow({
    workspaceId: workspace.sId,
    skillId: skillResource.sId,
  });
  if (deleteSearchResult.isErr()) {
    return deleteSearchResult;
  }
  await resourceClass.launchSearchIndexation(auth, referencingSkillIds);

  // Delete files from cloud storage outside the transaction (I/O with GCS).
  for (const file of filesToDelete) {
    const res = await file.delete(auth);
    if (res.isErr()) {
      return res;
    }
  }

  return new Ok(affectedCount);
}

export async function deleteAllForWorkspace(
  resourceClass: typeof SkillResource,
  auth: Authenticator
): Promise<Result<undefined, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  await AgentSkillModel.destroy({
    where: { workspaceId },
  });

  // Delete the editor grants and the regular_auto groups holding them: those groups exist only
  // to carry a skill's grant, so they go with the skills.
  const skills = await SkillConfigurationModel.findAll({
    attributes: ["id"],
    where: { workspaceId },
  });
  const grantGroups =
    await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
      grants: skills.map((skill) => ({
        grantType: SKILL_EDITOR_GRANT_TYPE,
        resourceType: "skill" as const,
        resourceId: skill.id,
      })),
    });

  for (const skill of skills) {
    await GroupPermissionResource.deleteAllForResource(auth, {
      resourceType: "skill",
      resourceId: skill.id,
    });
  }

  for (const grantGroup of grantGroups.values()) {
    await grantGroup.delete(auth);
  }

  // Delete file attachments and their underlying files.
  const fileAttachments = await SkillFileAttachmentModel.findAll({
    where: { workspaceId },
  });
  if (fileAttachments.length > 0) {
    const filesToDelete = await FileResource.fetchByModelIdsWithAuth(
      auth,
      fileAttachments.map((a) => a.fileId)
    );
    await SkillFileAttachmentModel.destroy({
      where: { workspaceId },
    });
    for (const file of filesToDelete) {
      const res = await file.delete(auth);
      if (res.isErr()) {
        throw res.error;
      }
    }
  }

  await SkillDataSourceConfigurationModel.destroy({
    where: { workspaceId },
  });

  await SkillMCPServerConfigurationModel.destroy({
    where: { workspaceId },
  });

  await SkillSuggestionModel.destroy({
    where: { workspaceId },
  });

  await SkillVersionModel.destroy({
    where: { workspaceId },
  });

  await AgentMessageSkillModel.destroy({
    where: { workspaceId },
  });

  await ConversationSkillModel.destroy({
    where: { workspaceId },
  });

  await SkillReferenceModel.destroy({
    where: { workspaceId },
  });

  await resourceClass.model.destroy({
    where: { workspaceId },
  });
  return launchDeleteWorkspaceSkillSearchWorkflow({
    workspaceId: auth.getNonNullableWorkspace().sId,
  });
}
