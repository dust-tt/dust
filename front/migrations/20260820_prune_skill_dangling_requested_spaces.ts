import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

// Prunes space ids from `requestedSpaceIds` that no longer point at a live space of the workspace.
// A skill keeping a dangling id is dropped by `SkillResource.baseFetch` (which requires every
// requested space to resolve), so it becomes invisible everywhere: unreadable in the product,
// unrestorable, and unreachable through Poke. Spaces can be hard-deleted, and the cleanup on
// soft-delete only covers active skills, so archived ones strand their references.
//
// Reads the models directly for that reason: the resource cannot fetch the very rows this repairs.
async function pruneWorkspaceSkillRequestedSpaces(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const skills = await SkillConfigurationModel.findAll({
    attributes: ["id", "status", "requestedSpaceIds"],
    where: {
      workspaceId: workspace.id,
      // Postgres: `<> '{}'` rather than a length check, so the filter stays index-friendly.
      requestedSpaceIds: { [Op.ne]: [] },
    },
  });
  if (skills.length === 0) {
    return;
  }

  const requestedSpaceIds = [
    ...new Set(skills.flatMap((skill) => skill.requestedSpaceIds)),
  ];

  // Soft-deleted spaces are excluded by the model's default scope, which is what we want: a
  // soft-deleted space is as unreachable as a missing row.
  const liveSpaces = await SpaceModel.findAll({
    attributes: ["id"],
    where: {
      id: { [Op.in]: requestedSpaceIds },
      workspaceId: workspace.id,
    },
  });
  const liveSpaceIds = new Set(liveSpaces.map((space) => space.id));

  for (const skill of skills) {
    const danglingSpaceIds = skill.requestedSpaceIds.filter(
      (spaceId) => !liveSpaceIds.has(spaceId)
    );
    if (danglingSpaceIds.length === 0) {
      continue;
    }

    const prunedSpaceIds = skill.requestedSpaceIds.filter((spaceId) =>
      liveSpaceIds.has(spaceId)
    );
    const context = {
      workspaceId: workspace.sId,
      skillModelId: skill.id,
      skillStatus: skill.status,
      requestedSpaceIds: skill.requestedSpaceIds,
      danglingSpaceIds,
      prunedSpaceIds,
    };

    if (!execute) {
      logger.info(context, "Dry-run: would prune dangling requested space ids");
      continue;
    }

    await skill.update({ requestedSpaceIds: prunedSpaceIds });

    logger.info(context, "Pruned dangling requested space ids");
  }
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting skill requested-space prune");

    if (wId) {
      const ws = await WorkspaceResource.fetchById(wId);
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await pruneWorkspaceSkillRequestedSpaces(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await pruneWorkspaceSkillRequestedSpaces(execute, logger, workspace);
        },
        { concurrency: 4 }
      );
    }

    logger.info("Skill requested-space prune completed");
  }
);
