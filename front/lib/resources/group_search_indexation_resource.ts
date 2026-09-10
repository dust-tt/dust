import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import { makeSId } from "@app/lib/resources/string_ids";
import {
  launchSkillsSearchIndexation,
  runAfterSkillSearchCommit,
} from "@app/lib/skill_search/indexation";
import type { GrantSpec } from "@app/types/group_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

interface SkillSearchIndexationTargets {
  skillIds: string[];
}

// Shared by group and grant writers without importing one another.
export class GroupSearchIndexationResource {
  static async fetchForGroups(
    workspace: LightWorkspaceType,
    groupModelIds: readonly ModelId[],
    transaction?: Transaction
  ): Promise<SkillSearchIndexationTargets> {
    const groupIds = [...new Set(groupModelIds)];
    if (groupIds.length === 0) {
      return { skillIds: [] };
    }
    const grants = await GroupPermissionModel.findAll({
      attributes: ["grantType", "resourceType", "resourceId"],
      where: {
        workspaceId: workspace.id,
        groupId: groupIds,
        grantType: "editor",
        resourceType: "skill",
        resourceId: { [Op.gt]: 0 },
      },
      transaction,
    });
    return this.targetsForGrants(workspace, grants);
  }

  private static targetsForGrants(
    workspace: LightWorkspaceType,
    grants: readonly GrantSpec[]
  ): SkillSearchIndexationTargets {
    return {
      skillIds: [
        ...new Set(
          grants
            .filter(
              (grant) =>
                grant.grantType === "editor" &&
                grant.resourceType === "skill" &&
                grant.resourceId > 0
            )
            .map((grant) =>
              makeSId("skill", {
                id: grant.resourceId,
                workspaceId: workspace.id,
              })
            )
        ),
      ],
    };
  }

  static async launchForGrants(
    {
      workspace,
      grants,
    }: { workspace: LightWorkspaceType; grants: readonly GrantSpec[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.launch(
      workspace,
      this.targetsForGrants(workspace, grants),
      transaction
    );
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] skill-editor-indexation
   * Editor grant and membership changes refresh only affected workspace skills after commit;
   * removed grants remain valid targets, and unrelated grant kinds never fan out.
   */
  static async launch(
    workspace: LightWorkspaceType,
    targets: SkillSearchIndexationTargets,
    transaction?: Transaction
  ): Promise<void> {
    if (!targets.skillIds.length) {
      return;
    }
    await runAfterSkillSearchCommit(transaction, () =>
      launchSkillsSearchIndexation({
        workspaceId: workspace.sId,
        skillIds: targets.skillIds,
      })
    );
  }

  static async launchForGroups(
    {
      workspace,
      groupModelIds,
    }: { workspace: LightWorkspaceType; groupModelIds: readonly ModelId[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const targets = await this.fetchForGroups(
      workspace,
      groupModelIds,
      transaction
    );
    await this.launch(workspace, targets, transaction);
  }
}
