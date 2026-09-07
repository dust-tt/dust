import { getReferencedSkillSpaceModelIds } from "@app/lib/api/skills/space_requirements";
import { Authenticator } from "@app/lib/auth";
import {
  SkillConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

// Backfills `manuallyRequestedSpaceIds`, the spaces a person picked by hand under "Data and
// access". Before that column existed the manual list was inferred by subtracting the spaces the
// skill's own content requires from `requestedSpaceIds`, which cannot tell a space that was picked
// by hand from one that a tool or knowledge happens to require too. This runs that subtraction one
// last time, per skill and per version, and stores the answer.
//
// Only rows still at the empty default are touched. A skill saved since the dual-write deploy
// already holds an authoritative list, and re-deriving it would undo exactly what this migration
// exists to fix. On a row that has been written and holds `[]` the subtraction returns `[]` as
// well, because `requestedSpaceIds` is then the derived set alone — so skipping non-empty rows
// loses nothing.
//
// The derived set comes from the same code the write paths use, under an Authenticator holding
// every group of the workspace: with narrower grants the resource layer would hide views and
// knowledge in restricted spaces, and their spaces would then be misread as hand-picked.

/** The spaces a skill's own content requires: tools, attached knowledge and nested skills. */
async function computeDerivedSpaceIds(
  auth: Authenticator,
  skill: SkillResource
): Promise<Set<ModelId>> {
  const attachedKnowledge = await skill.getAttachedKnowledge(auth);

  const computedSpaceIds = await SkillResource.computeRequestedSpaceIds(auth, {
    mcpServerViews: skill.mcpServerViews,
    attachedKnowledge,
  });
  const referencedSkillSpaceIds = await getReferencedSkillSpaceModelIds(
    auth,
    skill.instructions,
    skill.sId
  );

  return new Set([...computedSpaceIds, ...referencedSkillSpaceIds]);
}

/**
 * `requestedSpaceIds` minus what the content requires, restricted to spaces that still exist.
 *
 * A space that no longer exists must not become a manual choice: `canReadRequestedSpaces` requires
 * every requested space to resolve, so a dangling id would hide the skill from everyone once the
 * manual list starts feeding `requestedSpaceIds`.
 */
function classifyManualSpaceIds({
  requestedSpaceIds,
  derivedSpaceIds,
  liveSpaceIds,
}: {
  requestedSpaceIds: readonly ModelId[];
  derivedSpaceIds: Set<ModelId>;
  liveSpaceIds: Set<ModelId>;
}): ModelId[] {
  return requestedSpaceIds.filter(
    (spaceId) => !derivedSpaceIds.has(spaceId) && liveSpaceIds.has(spaceId)
  );
}

async function fetchLiveSpaceIds(
  workspace: LightWorkspaceType,
  spaceIds: readonly ModelId[]
): Promise<Set<ModelId>> {
  const uniqueSpaceIds = [...new Set(spaceIds)];
  if (uniqueSpaceIds.length === 0) {
    return new Set();
  }

  // Soft-deleted spaces are excluded by the model's default scope, which is what we want: a
  // soft-deleted space is as unreachable as a missing row.
  const liveSpaces = await SpaceModel.findAll({
    attributes: ["id"],
    where: {
      id: { [Op.in]: uniqueSpaceIds },
      workspaceId: workspace.id,
    },
  });

  return new Set(liveSpaces.map((space) => space.id));
}

/**
 * Backfills the skill's historical versions.
 *
 * Versions snapshot their tools and instructions but not their attached knowledge, so a space that
 * only some knowledge required at the time reads as hand-picked here. Version rows are only ever
 * displayed — the history endpoint and Poke — and never written back into a skill, so the
 * imprecision stays cosmetic, and erring this way lists the space rather than hiding it.
 */
async function backfillSkillVersions(
  auth: Authenticator,
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType,
  skill: SkillResource
): Promise<void> {
  // SkillVersionModel extends SkillConfigurationModel, so its own columns need the explicit type.
  const pendingVersionsWhere: WhereOptions<SkillVersionModel> = {
    workspaceId: workspace.id,
    skillConfigurationId: skill.id,
    requestedSpaceIds: { [Op.ne]: [] },
    manuallyRequestedSpaceIds: [],
  };
  const pendingVersions = await SkillVersionModel.findAll({
    attributes: ["id", "version"],
    where: pendingVersionsWhere,
  });
  if (pendingVersions.length === 0) {
    return;
  }

  // `listVersions` rebuilds each version with the skill's own model id, so the version number is
  // what identifies the row to update.
  const pendingRowIdByVersion = new Map(
    pendingVersions.map((row) => [row.version, row.id])
  );

  // Each version comes back as a SkillResource carrying its snapshotted tools, so the derived set
  // is computed by the same code as for the live skill.
  const versions = await skill.listVersions(auth);

  for (const version of versions) {
    const versionRowId = pendingRowIdByVersion.get(version.version);
    if (versionRowId === undefined) {
      continue;
    }

    const derivedSpaceIds = await computeDerivedSpaceIds(auth, version);
    const liveSpaceIds = await fetchLiveSpaceIds(
      workspace,
      version.requestedSpaceIds
    );
    const manuallyRequestedSpaceIds = classifyManualSpaceIds({
      requestedSpaceIds: version.requestedSpaceIds,
      derivedSpaceIds,
      liveSpaceIds,
    });
    if (manuallyRequestedSpaceIds.length === 0) {
      continue;
    }

    const context = {
      workspaceId: workspace.sId,
      skillId: skill.sId,
      skillVersionModelId: versionRowId,
      version: version.version,
      requestedSpaceIds: version.requestedSpaceIds,
      derivedSpaceIds: [...derivedSpaceIds],
      manuallyRequestedSpaceIds,
    };

    if (!execute) {
      logger.info(
        context,
        "Dry-run: would store manually requested spaces on version"
      );
      continue;
    }

    const versionUpdateWhere: WhereOptions<SkillVersionModel> = {
      id: versionRowId,
      workspaceId: workspace.id,
    };
    await SkillVersionModel.update(
      { manuallyRequestedSpaceIds },
      { where: versionUpdateWhere }
    );

    logger.info(context, "Stored manually requested spaces on version");
  }
}

async function backfillWorkspaceSkills(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const pendingSkills = await SkillConfigurationModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: workspace.id,
      // Postgres: `<> '{}'` rather than a length check, so the filter stays index-friendly.
      requestedSpaceIds: { [Op.ne]: [] },
      // Never overwrite a list the application has already written.
      manuallyRequestedSpaceIds: [],
    },
  });

  const pendingVersionSkillsWhere: WhereOptions<SkillVersionModel> = {
    workspaceId: workspace.id,
    requestedSpaceIds: { [Op.ne]: [] },
    manuallyRequestedSpaceIds: [],
  };
  const skillIdsWithPendingVersions = await SkillVersionModel.findAll({
    attributes: ["skillConfigurationId"],
    where: pendingVersionSkillsWhere,
    group: ["skillConfigurationId"],
  });

  const skillModelIds = [
    ...new Set([
      ...pendingSkills.map((skill) => skill.id),
      ...skillIdsWithPendingVersions.map(
        (version) => version.skillConfigurationId
      ),
    ]),
  ];
  if (skillModelIds.length === 0) {
    return;
  }

  // Every group of the workspace, so the resource layer hides nothing: skills in restricted spaces
  // are the ones whose manual selections matter most.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });

  // Skipping the permission filter is what lets the repair reach a skill that requests a space
  // which no longer exists: `baseFetch` drops those, and they are precisely the rows whose stale
  // ids need dropping from the manual list rather than being copied into it.
  const skills = await SkillResource.fetchByModelIds(auth, skillModelIds, {
    permissionFiltering: "dangerously_skip",
    // `fetchByModelIds` returns active skills only by default. An archived or suggested skill still
    // holds its requested spaces and can be restored and saved, so it needs the provenance too.
    status: ["active", "archived", "suggested"],
  });
  if (skills.length !== skillModelIds.length) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        requestedCount: skillModelIds.length,
        fetchedCount: skills.length,
      },
      "Some skills could not be fetched and are left untouched"
    );
  }

  const pendingSkillIds = new Set(pendingSkills.map((skill) => skill.id));

  for (const skill of skills) {
    if (pendingSkillIds.has(skill.id)) {
      const derivedSpaceIds = await computeDerivedSpaceIds(auth, skill);
      const liveSpaceIds = await fetchLiveSpaceIds(
        workspace,
        skill.requestedSpaceIds
      );
      const manuallyRequestedSpaceIds = classifyManualSpaceIds({
        requestedSpaceIds: skill.requestedSpaceIds,
        derivedSpaceIds,
        liveSpaceIds,
      });

      if (manuallyRequestedSpaceIds.length > 0) {
        const context = {
          workspaceId: workspace.sId,
          skillModelId: skill.id,
          skillId: skill.sId,
          skillStatus: skill.status,
          requestedSpaceIds: skill.requestedSpaceIds,
          derivedSpaceIds: [...derivedSpaceIds],
          manuallyRequestedSpaceIds,
        };

        if (execute) {
          await SkillConfigurationModel.update(
            { manuallyRequestedSpaceIds },
            { where: { id: skill.id, workspaceId: workspace.id } }
          );
          logger.info(context, "Stored manually requested spaces");
        } else {
          logger.info(
            context,
            "Dry-run: would store manually requested spaces"
          );
        }
      }
    }

    await backfillSkillVersions(auth, execute, logger, workspace, skill);
  }
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting skill manually-requested-spaces backfill");

    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillWorkspaceSkills(execute, logger, workspace);
      },
      { concurrency: 8, wId }
    );

    logger.info("Skill manually-requested-spaces backfill completed");
  }
);
