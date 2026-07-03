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
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { SkillReferenceModel } from "@app/lib/models/skill/skill_reference";
import { SkillSuggestionModel } from "@app/lib/models/skill/skill_suggestion";
import { FileResource } from "@app/lib/resources/file_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import * as skillReferences from "@app/lib/resources/skill/skill_references";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";

export async function deleteSkill(
  auth: Authenticator,
  skill: SkillResource
): Promise<Result<number, Error>> {
  try {
    assert(
      skill.canWrite(auth),
      "User does not have permission to delete this skill."
    );

    const workspace = auth.getNonNullableWorkspace();

    const whereWorkspaceIdAndSkillId = {
      skillConfigurationId: skill.id,
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

    const affectedCount = await withTransaction(async (transaction) => {
      await skillReferences.propagateReferenceUpdatesToParentSkills(
        auth,
        skill,
        {
          icon: skill.icon,
          name: skill.name,
          requestedSpaceIds: skill.requestedSpaceIds,
          status: "archived",
        },
        { transaction }
      );

      // Delete agent-skill associations.
      await AgentSkillModel.destroy({
        where: {
          customSkillId: skill.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

      await ProjectMetadataResource.removeSkillFromAllDefaultSkills(
        auth,
        skill.sId,
        transaction
      );

      await GroupSkillModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      if (skill.editorGroup) {
        await skill.editorGroup.delete(auth, { transaction });
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
          parentSkillId: skill.id,
        },
        transaction,
      });

      await SkillReferenceModel.destroy({
        where: {
          workspaceId: workspace.id,
          childCustomSkillId: skill.id,
        },
        transaction,
      });

      return SkillConfigurationModel.destroy({
        where: {
          id: skill.id,
          workspaceId: workspace.id,
        },
        transaction,
      });
    });

    // Delete files from cloud storage outside the transaction (I/O with GCS).
    for (const file of filesToDelete) {
      const res = await file.delete(auth);
      if (res.isErr()) {
        return res;
      }
    }

    return new Ok(affectedCount);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function deleteAllForWorkspace(
  auth: Authenticator
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  await AgentSkillModel.destroy({
    where: { workspaceId },
  });

  // Delete editor groups associated with skills.
  const groupSkills = await GroupSkillModel.findAll({
    where: { workspaceId },
  });
  const editorGroups = await GroupResource.fetchByModelIds(
    auth,
    groupSkills.map((gs) => gs.groupId)
  );

  await GroupSkillModel.destroy({
    where: { workspaceId },
  });

  for (const editorGroup of editorGroups) {
    await editorGroup.delete(auth);
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

  await SkillConfigurationModel.destroy({
    where: { workspaceId },
  });
}
