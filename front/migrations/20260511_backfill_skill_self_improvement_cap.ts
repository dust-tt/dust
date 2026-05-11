import { Authenticator } from "@app/lib/auth";
import { DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD } from "@app/lib/reinforcement/constants";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { Logger } from "@app/logger/logger";
import { SKILL_STATUSES } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function backfillSkillCapForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const skills = await SkillResource.listByWorkspace(auth, {
    status: [...SKILL_STATUSES],
    onlyCustom: true,
  });

  const skillsWithZeroCap = skills.filter(
    (skill) => Number(skill.selfImprovementCostsCapMicroUsd) === 0
  );

  if (skillsWithZeroCap.length === 0) {
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      count: skillsWithZeroCap.length,
      execute,
    },
    execute
      ? "[Backfill] Updating selfImprovementCostsCapMicroUsd for skills with cap set to 0"
      : "[Backfill] [DRY RUN] Would update selfImprovementCostsCapMicroUsd for skills with cap set to 0"
  );

  for (const skill of skillsWithZeroCap) {
    if (execute) {
      await skill.updateSelfImprovementCostsCap(
        DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD
      );
    }
    logger.info(
      {
        workspaceId: workspace.sId,
        skillId: skill.sId,
        skillName: skill.name,
        newCapMicroUsd: DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
      },
      execute
        ? "[Backfill] Updated skill cap"
        : "[Backfill] [DRY RUN] Would update skill cap"
    );
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillSkillCapForWorkspace(workspace, execute, logger);
      },
      { wId: workspaceId }
    );
  }
);
