import type { Logger } from "pino";

import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { LightWorkspaceType } from "@app/types";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillConfigurationModel } from "@app/lib/models/skill";

async function backfillSkillVersions(
  workspace: LightWorkspaceType,
  logger: Logger,
  {
    execute,
  }: {
    execute: boolean;
  }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const skills = await SkillResource.listSkills(auth);
  for (const skill of skills) {
    const versions = await skill.listVersions(auth);

    if (execute) {
      await SkillConfigurationModel.update(
        {
          // If we have versions 1, 2, 3, the current version is 4.
          version: versions.length + 1,
        },
        {
          where: {
            id: skill.id,
          },
        }
      );
      logger.info(
        {
          skillId: skill.id,
          version: versions.length + 1,
        },
        "Updated skill version"
      );
    } else {
      logger.info(
        {
          skillId: skill.id,
          version: versions.length + 1,
        },
        "Would update skill version"
      );
    }
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      required: true,
    },
  },
  async ({ execute, workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    await backfillSkillVersions(
      renderLightWorkspaceType({ workspace }),
      logger,
      { execute }
    );
  }
);
