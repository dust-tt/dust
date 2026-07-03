import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
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
import { SkillResourceWithUpdates } from "@app/lib/resources/skill/skill_resource_updates";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";

/**
 * Layer of the SkillResource inheritance chain owning the skill lifecycle:
 * archiving, restoring and deleting skills.
 */
export abstract class SkillResourceWithLifecycle extends SkillResourceWithUpdates {
  async archive(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(this.canWrite(auth), "User is not authorized to archive this skill");

    const workspace = auth.getNonNullableWorkspace();

    const affectedCount = await withTransaction(async (transaction) => {
      // Rename any existing archived skill with the same name to avoid unique constraint violation.
      const existingArchivedSkill = await this.model.findOne({
        where: {
          workspaceId: workspace.id,
          name: this.name,
          status: "archived",
        },
        transaction,
      });

      if (existingArchivedSkill) {
        const timestamp = formatTimestampToFriendlyDate(
          existingArchivedSkill.updatedAt.getTime(),
          "compactWithDay"
        );
        await existingArchivedSkill.update(
          { name: `${existingArchivedSkill.name} (archived on ${timestamp})` },
          { transaction }
        );
      }

      // We preserve AgentSkillModel, ConversationSkillModel, and
      // SkillReferenceModel relationships so they can be restored when the skill
      // is unarchived.
      const [count] = await this.update({ status: "archived" }, transaction);

      if (count > 0) {
        // The skill no longer contributes any space requirement: drop its
        // spaces from the agents using it (unless another active capability
        // still requires them).
        await this.updateActiveAgentsRequirements(
          auth,
          {
            previousRequestedSpaceIds: this.requestedSpaceIds,
            newRequestedSpaceIds: [],
          },
          { transaction }
        );

        await this.propagateReferenceUpdatesToParentSkills(
          auth,
          {
            icon: this.icon,
            name: this.name,
            requestedSpaceIds: this.requestedSpaceIds,
            status: "archived",
          },
          { transaction }
        );

        // Suspend all editor group memberships for this skill.
        if (this.editorGroup) {
          await this.editorGroup.suspendMembers(auth, { transaction });
        }
      }

      return count;
    });

    return { affectedCount };
  }

  async restore(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(this.canWrite(auth), "User is not authorized to restore this skill");

    const affectedCount = await withTransaction(async (transaction) => {
      const [count] = await this.update({ status: "active" }, transaction);

      if (count > 0) {
        // The skill contributes its space requirements again: add them back to
        // the agents using it.
        await this.updateActiveAgentsRequirements(
          auth,
          {
            previousRequestedSpaceIds: [],
            newRequestedSpaceIds: this.requestedSpaceIds,
          },
          { transaction }
        );

        await this.propagateReferenceUpdatesToParentSkills(
          auth,
          {
            icon: this.icon,
            name: this.name,
            requestedSpaceIds: this.requestedSpaceIds,
            status: "active",
          },
          { transaction }
        );

        // Restore all editor group memberships (set suspended → active).
        if (this.editorGroup) {
          await this.editorGroup.restoreMembers(auth, { transaction });
        }
      }

      return count;
    });

    return { affectedCount };
  }

  async delete(auth: Authenticator): Promise<Result<number, Error>> {
    try {
      assert(
        this.canWrite(auth),
        "User does not have permission to delete this skill."
      );

      const workspace = auth.getNonNullableWorkspace();

      const whereWorkspaceIdAndSkillId = {
        skillConfigurationId: this.id,
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
        await this.propagateReferenceUpdatesToParentSkills(
          auth,
          {
            icon: this.icon,
            name: this.name,
            requestedSpaceIds: this.requestedSpaceIds,
            status: "archived",
          },
          { transaction }
        );

        // Delete agent-skill associations.
        await AgentSkillModel.destroy({
          where: {
            customSkillId: this.id,
            workspaceId: workspace.id,
          },
          transaction,
        });

        await ProjectMetadataResource.removeSkillFromAllDefaultSkills(
          auth,
          this.sId,
          transaction
        );

        await GroupSkillModel.destroy({
          where: whereWorkspaceIdAndSkillId,
          transaction,
        });

        if (this.editorGroup) {
          await this.editorGroup.delete(auth, { transaction });
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
            parentSkillId: this.id,
          },
          transaction,
        });

        await SkillReferenceModel.destroy({
          where: {
            workspaceId: workspace.id,
            childCustomSkillId: this.id,
          },
          transaction,
        });

        return this.model.destroy({
          where: {
            id: this.id,
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

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
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

    await this.model.destroy({
      where: { workspaceId },
    });
  }
}
