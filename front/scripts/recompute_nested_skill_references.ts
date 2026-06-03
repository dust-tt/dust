import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import {
  extractUniqueSkillReferenceIds,
  parseSkillReferenceTag,
  SKILL_REFERENCE_TAG_REGEX,
  serializeSkillTag,
  serializeUnavailableSkillTag,
} from "@app/lib/skills/format";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import { createTwoFilesPatch } from "diff";
import isEqual from "lodash/isEqual";
import uniq from "lodash/uniq";

const SKILL_STATUSES_TO_PROCESS: SkillStatus[] = ["active", "suggested"];

type SkillReferenceTarget = {
  icon: string | null;
  id: string;
  name: string;
  requestedSpaceIds: readonly ModelId[];
};

type SkillRecomputePlan = {
  currentReferenceIds: string[];
  instructions: string;
  instructionsChanged: boolean;
  instructionsHtml: string | null;
  instructionsHtmlChanged: boolean;
  referenceIds: string[];
  referencesChanged: boolean;
};

type WorkspaceStats = {
  totalSkills: number;
  changedSkills: number;
  instructionChanges: number;
  instructionsHtmlChanges: number;
  referenceChanges: number;
};

function formatReferenceIds(referenceIds: readonly string[]): string {
  if (referenceIds.length === 0) {
    return "";
  }

  return `${referenceIds.join("\n")}\n`;
}

function isPlanChanged(plan: SkillRecomputePlan): boolean {
  return (
    plan.instructionsChanged ||
    plan.instructionsHtmlChanged ||
    plan.referencesChanged
  );
}

function extractReferencedSkillIds(...contents: (string | null)[]): string[] {
  return [
    ...new Set(
      contents.flatMap((content) =>
        content ? extractUniqueSkillReferenceIds(content) : []
      )
    ),
  ].sort();
}

async function getReferenceIdsToSync(
  auth: Authenticator,
  referencedSkillIds: string[]
): Promise<string[]> {
  const workspace = auth.getNonNullableWorkspace();
  const customReferenceIds: string[] = [];
  const globalReferenceIds: string[] = [];

  for (const referencedSkillId of referencedSkillIds) {
    const parsed = getResourceNameAndIdFromSId(referencedSkillId);

    if (!parsed) {
      globalReferenceIds.push(referencedSkillId);
      continue;
    }

    if (
      parsed.resourceName === "skill" &&
      parsed.workspaceModelId === workspace.id
    ) {
      customReferenceIds.push(referencedSkillId);
    }
  }

  const customSkills = await SkillResource.fetchByIds(auth, customReferenceIds);

  return [...customSkills.map((skill) => skill.sId), ...globalReferenceIds]
    .filter((skillId, index, skillIds) => skillIds.indexOf(skillId) === index)
    .sort();
}

function replaceSkillReferenceTags({
  content,
  html,
  parentRequestedSpaceIds,
  targets,
}: {
  content: string;
  html?: boolean;
  parentRequestedSpaceIds: readonly ModelId[];
  targets: ReadonlyMap<string, SkillReferenceTarget>;
}): string {
  if (targets.size === 0) {
    return content;
  }

  const parentRequestedSpaceIdsSet = new Set(parentRequestedSpaceIds);

  return content.replace(SKILL_REFERENCE_TAG_REGEX, (tag) => {
    const skill = parseSkillReferenceTag(tag);
    const target = skill ? targets.get(skill.id) : undefined;

    if (!target) {
      return tag;
    }

    const isAvailable = target.requestedSpaceIds.every((spaceId) =>
      parentRequestedSpaceIdsSet.has(spaceId)
    );

    if (!isAvailable) {
      return serializeUnavailableSkillTag({ id: target.id }, { html });
    }

    return serializeSkillTag(
      {
        icon: target.icon,
        id: target.id,
        name: target.name,
      },
      { html }
    );
  });
}

async function getReferenceTargets(
  auth: Authenticator,
  parentSkill: SkillResource,
  referencedSkillIds: string[]
): Promise<Map<string, SkillReferenceTarget>> {
  const workspace = auth.getNonNullableWorkspace();
  const customReferenceIds = referencedSkillIds.filter((skillId) => {
    const parsed = getResourceNameAndIdFromSId(skillId);

    return (
      parsed?.resourceName === "skill" &&
      parsed.workspaceModelId === workspace.id &&
      skillId !== parentSkill.sId
    );
  });
  const referencedSkills = await SkillResource.fetchByIds(
    auth,
    customReferenceIds
  );

  return new Map(
    referencedSkills.map((skill) => [
      skill.sId,
      {
        icon: skill.icon,
        id: skill.sId,
        name: skill.name,
        requestedSpaceIds: skill.requestedSpaceIds,
      },
    ])
  );
}

async function buildRecomputePlan({
  auth,
  currentReferenceIds,
  globalSpaceId,
  skill,
}: {
  auth: Authenticator;
  currentReferenceIds: readonly string[];
  globalSpaceId: ModelId;
  skill: SkillResource;
}): Promise<SkillRecomputePlan> {
  const referencedSkillIds = extractReferencedSkillIds(
    skill.instructions,
    skill.instructionsHtml
  );
  const targets = await getReferenceTargets(auth, skill, referencedSkillIds);
  const parentRequestedSpaceIds = uniq([
    ...skill.requestedSpaceIds,
    globalSpaceId,
  ]);
  const instructions = replaceSkillReferenceTags({
    content: skill.instructions,
    parentRequestedSpaceIds,
    targets,
  });
  const instructionsHtml =
    skill.instructionsHtml !== null
      ? replaceSkillReferenceTags({
          content: skill.instructionsHtml,
          html: true,
          parentRequestedSpaceIds,
          targets,
        })
      : null;
  const referenceIds = await getReferenceIdsToSync(
    auth,
    extractReferencedSkillIds(instructions, instructionsHtml)
  );

  return {
    currentReferenceIds: [...currentReferenceIds].sort(),
    instructions,
    instructionsChanged: instructions !== skill.instructions,
    instructionsHtml,
    instructionsHtmlChanged: instructionsHtml !== skill.instructionsHtml,
    referenceIds,
    referencesChanged: !isEqual([...currentReferenceIds].sort(), referenceIds),
  };
}

async function applyRecomputePlan({
  auth,
  plan,
  skill,
}: {
  auth: Authenticator;
  plan: SkillRecomputePlan;
  skill: SkillResource;
}): Promise<void> {
  await skill.updateSkill(auth, {
    agentFacingDescription: skill.agentFacingDescription,
    attachedKnowledge: await skill.getAttachedKnowledge(auth),
    icon: skill.icon,
    instructions: plan.instructions,
    instructionsHtml: plan.instructionsHtml,
    isDefault: skill.isDefault,
    mcpServerViews: skill.mcpServerViews,
    name: skill.name,
    reinforcement: skill.reinforcement,
    requestedSpaceIds: skill.requestedSpaceIds,
    referencedSkillIds: plan.referenceIds,
    userFacingDescription: skill.userFacingDescription,
    enableSkillReferences: true,
  });
}

function printDiff({
  after,
  before,
  field,
  skillSId,
}: {
  after: string;
  before: string;
  field: string;
  skillSId: string;
}): void {
  const diff = createTwoFilesPatch(
    `skills/${skillSId}/${field}.current`,
    `skills/${skillSId}/${field}.recomputed`,
    before,
    after,
    undefined,
    undefined,
    { context: 3 }
  );

  process.stdout.write(`${diff}\n`);
}

function printPlanDiff({
  plan,
  skill,
}: {
  plan: SkillRecomputePlan;
  skill: SkillResource;
}): void {
  if (plan.instructionsChanged) {
    printDiff({
      after: plan.instructions,
      before: skill.instructions,
      field: "instructions.md",
      skillSId: skill.sId,
    });
  }

  if (plan.instructionsHtmlChanged) {
    printDiff({
      after: plan.instructionsHtml ?? "",
      before: skill.instructionsHtml ?? "",
      field: "instructions.html",
      skillSId: skill.sId,
    });
  }

  if (plan.referencesChanged) {
    printDiff({
      after: formatReferenceIds(plan.referenceIds),
      before: formatReferenceIds(plan.currentReferenceIds),
      field: "skill_references.txt",
      skillSId: skill.sId,
    });
  }
}

async function recomputeNestedSkillReferencesForWorkspace({
  execute,
  logger,
  workspaceId,
}: {
  execute: boolean;
  logger: Logger;
  workspaceId: string;
}): Promise<WorkspaceStats> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });
  const workspace = auth.getNonNullableWorkspace();
  const [globalSpace, skills] = await Promise.all([
    SpaceResource.fetchWorkspaceGlobalSpace(auth),
    SkillResource.listByWorkspace(auth, {
      status: SKILL_STATUSES_TO_PROCESS,
      onlyCustom: true,
      withInstructions: true,
      withTools: true,
    }),
  ]);
  const childSkillsByParentSkillId = await SkillResource.batchFetchChildSkills(
    auth,
    skills
  );

  logger.info(
    {
      execute,
      skillCount: skills.length,
      workspaceId,
      workspaceModelId: workspace.id,
    },
    execute
      ? "Recomputing nested skill references"
      : "Computing nested skill reference diff"
  );

  const stats: WorkspaceStats = {
    totalSkills: skills.length,
    changedSkills: 0,
    instructionChanges: 0,
    instructionsHtmlChanges: 0,
    referenceChanges: 0,
  };

  for (const skill of skills) {
    const plan = await buildRecomputePlan({
      auth,
      currentReferenceIds: (
        childSkillsByParentSkillId.get(skill.sId) ?? []
      ).map((childSkill) => childSkill.sId),
      globalSpaceId: globalSpace.id,
      skill,
    });

    if (!isPlanChanged(plan)) {
      continue;
    }

    stats.changedSkills++;
    if (plan.instructionsChanged) {
      stats.instructionChanges++;
    }
    if (plan.instructionsHtmlChanged) {
      stats.instructionsHtmlChanges++;
    }
    if (plan.referencesChanged) {
      stats.referenceChanges++;
    }

    logger.info(
      {
        execute,
        instructionsChanged: plan.instructionsChanged,
        instructionsHtmlChanged: plan.instructionsHtmlChanged,
        referencesChanged: plan.referencesChanged,
        skillId: skill.sId,
        skillModelId: skill.id,
        skillName: skill.name,
        workspaceId,
      },
      execute
        ? "Applying nested skill reference recompute"
        : "Nested skill reference recompute diff"
    );

    if (execute) {
      await applyRecomputePlan({ auth, plan, skill });
    } else {
      printPlanDiff({ plan, skill });
    }
  }

  return stats;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      describe: "Workspace sId whose custom skills should be recomputed.",
    },
  },
  async ({ execute, workspaceId }, logger) => {
    const stats = await recomputeNestedSkillReferencesForWorkspace({
      execute,
      logger,
      workspaceId,
    });

    logger.info(
      {
        execute,
        workspaceId,
        ...stats,
      },
      execute
        ? "Nested skill reference recompute complete"
        : "Nested skill reference recompute dry-run complete"
    );
  }
);
