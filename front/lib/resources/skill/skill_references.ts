import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillReferenceModel } from "@app/lib/models/skill/skill_reference";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillReferenceFetcher } from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getResourceIdFromSId,
  getResourceNameAndIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import {
  extractUniqueSkillReferenceIds,
  parseSkillReferenceTag,
  renameSkillReferencesInContent,
  SKILL_REFERENCE_TAG_REGEX,
  serializeSkillTag,
  serializeUnavailableSkillTag,
} from "@app/lib/skills/format";
import type {
  SkillStatus,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import groupBy from "lodash/groupBy";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

type SkillReferenceTarget = {
  icon: string | null;
  id: string;
  name: string;
  requestedSpaceIds: readonly ModelId[];
  status: SkillStatus;
};

type ReplaceSkillReferenceTagsOptions = {
  html?: boolean;
};

export function getSkillReference(
  skill: SkillResource
): { globalSkillId: string } | { customSkillId: ModelId } {
  return skill.kind !== "custom"
    ? { globalSkillId: skill.sId }
    : { customSkillId: skill.id };
}

export async function batchFetchChildSkills(
  resourceClass: typeof SkillResource,
  fetchReferencedSkills: SkillReferenceFetcher,
  auth: Authenticator,
  parentSkills: SkillResource[]
): Promise<Map<string, SkillResource[]>> {
  const workspace = auth.getNonNullableWorkspace();
  const customParentSkills = parentSkills.filter(
    (skill) => skill.kind === "custom"
  );

  if (customParentSkills.length === 0) {
    return new Map();
  }

  const skillReferences = await SkillReferenceModel.findAll({
    attributes: ["childCustomSkillId", "childGlobalSkillId", "parentSkillId"],
    where: {
      workspaceId: workspace.id,
      parentSkillId: customParentSkills.map((skill) => skill.id),
    },
  });

  if (skillReferences.length === 0) {
    return new Map(
      customParentSkills.map((parentSkill) => [parentSkill.sId, []])
    );
  }

  const childSkills = await fetchReferencedSkills(
    auth,
    skillReferences.map((reference) => ({
      customSkillId: reference.childCustomSkillId,
      globalSkillId: reference.childGlobalSkillId,
    })),
    {
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    }
  );
  const childSkillsById = new Map(
    childSkills.map((skill) => [skill.sId, skill])
  );
  const referencesByParentSkillId = groupBy(skillReferences, "parentSkillId");

  return new Map(
    customParentSkills.map((parentSkill) => [
      parentSkill.sId,
      removeNulls(
        (referencesByParentSkillId[parentSkill.id] ?? []).map((reference) => {
          const childSkillId = skillReferenceChildId(
            resourceClass,
            auth,
            reference
          );

          return childSkillId
            ? (childSkillsById.get(childSkillId) ?? null)
            : null;
        })
      ),
    ])
  );
}

function skillReferenceChildId(
  resourceClass: typeof SkillResource,
  auth: Authenticator,
  reference: Pick<
    SkillReferenceModel,
    "childCustomSkillId" | "childGlobalSkillId"
  >
): string | null {
  if (reference.childGlobalSkillId !== null) {
    return reference.childGlobalSkillId;
  }

  if (reference.childCustomSkillId !== null) {
    const workspace = auth.getNonNullableWorkspace();

    return resourceClass.modelIdToSId({
      id: reference.childCustomSkillId,
      workspaceId: workspace.id,
    });
  }

  return null;
}

export async function batchFetchUsedBySkills(
  resourceClass: typeof SkillResource,
  auth: Authenticator,
  skills: SkillResource[]
): Promise<Map<string, UsedBySkillType[]>> {
  const result = new Map<string, UsedBySkillType[]>(
    skills.map((skill) => [skill.sId, []])
  );

  const customSkills = skills.filter((skill) => skill.kind === "custom");
  const globalSkills = skills.filter((skill) => skill.kind !== "custom");
  if (customSkills.length === 0 && globalSkills.length === 0) {
    return result;
  }

  const workspace = auth.getNonNullableWorkspace();
  const skillReferences = await SkillReferenceModel.findAll({
    attributes: ["childCustomSkillId", "childGlobalSkillId", "parentSkillId"],
    where: {
      workspaceId: workspace.id,
      [Op.or]: [
        {
          childCustomSkillId: {
            [Op.in]: customSkills.map((skill) => skill.id),
          },
        },
        {
          childGlobalSkillId: {
            [Op.in]: globalSkills.map((skill) => skill.sId),
          },
        },
      ],
    },
  });

  if (skillReferences.length === 0) {
    return result;
  }

  const parentSkills = await resourceClass.fetchByModelIds(
    auth,
    uniq(skillReferences.map((reference) => reference.parentSkillId)),
    { withTools: false }
  );

  const parentSkillByModelId = new Map(
    parentSkills.map((skill) => [skill.id, skill])
  );
  const usedBySkillsByChildSkillId = new Map<string, UsedBySkillType[]>();
  for (const reference of skillReferences) {
    const childSkillId = skillReferenceChildId(resourceClass, auth, reference);
    const parentSkill = parentSkillByModelId.get(reference.parentSkillId);
    if (!childSkillId || !parentSkill) {
      continue;
    }

    const usedBySkills = usedBySkillsByChildSkillId.get(childSkillId) ?? [];
    usedBySkills.push({
      sId: parentSkill.sId,
      name: parentSkill.name,
      icon: parentSkill.icon,
    });
    usedBySkillsByChildSkillId.set(childSkillId, usedBySkills);
  }

  for (const [childSkillId, usedBySkills] of usedBySkillsByChildSkillId) {
    const sortedUsedBySkills = [...usedBySkills].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    result.set(childSkillId, sortedUsedBySkills);
  }

  return result;
}

/**
 * Rewrites inline references to this skill in every parent skill so their tag
 * availability reflects this skill's current status and requested spaces.
 */
/**
 * @cc [owner:aubin-tchoi,label:backend;performance] reference-refresh-targets
 * Parent-reference rewrites preserve the existing writes and return every changed
 * parent ID so callers can enqueue those parents after their transaction commits.
 */
export async function propagateReferenceUpdatesToParentSkills(
  resourceClass: typeof SkillResource,
  skillResource: SkillResource,
  auth: Authenticator,
  {
    icon,
    name,
    requestedSpaceIds,
    status,
  }: {
    icon: string | null;
    name: string;
    requestedSpaceIds: readonly ModelId[];
    status: SkillStatus;
  },
  { transaction }: { transaction?: Transaction } = {}
): Promise<string[]> {
  const workspace = auth.getNonNullableWorkspace();

  const references = await SkillReferenceModel.findAll({
    where: {
      workspaceId: workspace.id,
      childCustomSkillId: skillResource.id,
    },
    transaction,
  });

  const referencingSkillIds = uniq(
    references.map((reference) => reference.parentSkillId)
  );

  if (referencingSkillIds.length === 0) {
    return [];
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(
    auth,
    transaction
  );
  const target = new Map<string, SkillReferenceTarget>([
    [
      skillResource.sId,
      {
        icon,
        id: skillResource.sId,
        name,
        requestedSpaceIds,
        status,
      },
    ],
  ]);

  const referencingSkills = await skillResource.model.findAll({
    where: {
      workspaceId: workspace.id,
      id: referencingSkillIds,
    },
    transaction,
  });

  const changedSkillIds: string[] = [];
  // Each update carries distinct instructions content so it cannot be
  // batched. Bounded by the number of skills referencing this one.
  for (const referencingSkill of referencingSkills) {
    const parentRequestedSpaceIds = uniq([
      ...referencingSkill.requestedSpaceIds,
      globalSpace.id,
    ]);
    const renamedInstructions = renameSkillReferencesInContent(
      referencingSkill.instructions,
      { skillId: skillResource.sId, newName: name }
    );
    const renamedInstructionsHtml =
      referencingSkill.instructionsHtml != null
        ? renameSkillReferencesInContent(referencingSkill.instructionsHtml, {
            skillId: skillResource.sId,
            newName: name,
          })
        : referencingSkill.instructionsHtml;
    const instructions = replaceSkillReferenceTags(
      renamedInstructions,
      target,
      parentRequestedSpaceIds
    );
    const instructionsHtml =
      renamedInstructionsHtml !== null
        ? replaceSkillReferenceTags(
            renamedInstructionsHtml,
            target,
            parentRequestedSpaceIds,
            { html: true }
          )
        : null;

    if (
      instructions === referencingSkill.instructions &&
      instructionsHtml === referencingSkill.instructionsHtml
    ) {
      continue;
    }

    await referencingSkill.update(
      { instructions, instructionsHtml },
      { transaction }
    );
    changedSkillIds.push(
      resourceClass.modelIdToSId({
        id: referencingSkill.id,
        workspaceId: workspace.id,
      })
    );
  }
  return changedSkillIds;
}

/**
 * Sync the denormalized skill_references rows with the inline skill reference
 * tags found in the instructions (the source of truth). Deriving from the
 * instructions keeps the table consistent on every write path, including
 * restoring a previous version whose references differ from the current ones.
 */
export async function syncSkillReferences(
  skillResource: SkillResource,
  auth: Authenticator,
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  // Self-references are intentionally kept (#26680 allows them).
  const referencedSkillIds = extractUniqueSkillReferenceIds(
    skillResource.instructions
  );

  // Retrieve what we want the end state to be.
  const referencedCustomSkillIds = uniq(
    removeNulls(
      referencedSkillIds.map((sId) => {
        const parsed = getResourceNameAndIdFromSId(sId);

        return parsed?.resourceName === "skill" &&
          parsed.workspaceModelId === workspace.id
          ? parsed.resourceModelId
          : null;
      })
    )
  );
  const referencedGlobalSkillIds = uniq(
    referencedSkillIds.filter((sId) => !getResourceNameAndIdFromSId(sId))
  );

  const childSkills = await skillResource.model.findAll({
    attributes: ["id"],
    where: {
      id: { [Op.in]: referencedCustomSkillIds },
      workspaceId: workspace.id,
    },
    transaction,
  });

  const desiredCustomSkillIds = new Set(childSkills.map((skill) => skill.id));
  const desiredGlobalSkillIds = new Set(referencedGlobalSkillIds);

  // Retrieve the current state.
  const existingReferences = await SkillReferenceModel.findAll({
    where: {
      workspaceId: workspace.id,
      parentSkillId: skillResource.id,
    },
    transaction,
  });

  const existingCustomSkillIds = new Set(
    removeNulls(existingReferences.map((ref) => ref.childCustomSkillId))
  );
  const existingGlobalSkillIds = new Set(
    removeNulls(existingReferences.map((ref) => ref.childGlobalSkillId))
  );

  // Delete references that are in the current state but not the end state.
  const referencesToDelete = existingReferences.filter((ref) => {
    if (ref.childCustomSkillId !== null) {
      return !desiredCustomSkillIds.has(ref.childCustomSkillId);
    }

    if (ref.childGlobalSkillId !== null) {
      return !desiredGlobalSkillIds.has(ref.childGlobalSkillId);
    }

    return true;
  });

  if (referencesToDelete.length > 0) {
    await SkillReferenceModel.destroy({
      where: {
        id: { [Op.in]: referencesToDelete.map((ref) => ref.id) },
        workspaceId: workspace.id,
      },
      transaction,
    });
  }

  // Add references that are in the end state but not the current state.
  const referencesToCreate = [
    ...[...desiredCustomSkillIds]
      .filter((childSkillId) => !existingCustomSkillIds.has(childSkillId))
      .map((childSkillId) => ({
        workspaceId: workspace.id,
        parentSkillId: skillResource.id,
        childCustomSkillId: childSkillId,
        childGlobalSkillId: null,
      })),
    ...[...desiredGlobalSkillIds]
      .filter((globalSkillId) => !existingGlobalSkillIds.has(globalSkillId))
      .map((globalSkillId) => ({
        workspaceId: workspace.id,
        parentSkillId: skillResource.id,
        childCustomSkillId: null,
        childGlobalSkillId: globalSkillId,
      })),
  ];

  if (referencesToCreate.length > 0) {
    await SkillReferenceModel.bulkCreate(referencesToCreate, { transaction });
  }
}

function replaceSkillReferenceTags(
  content: string,
  targets: ReadonlyMap<string, SkillReferenceTarget>,
  parentRequestedSpaceIds: readonly ModelId[],
  { html = false }: ReplaceSkillReferenceTagsOptions = {}
): string {
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

    const isAvailable =
      target.status === "active" &&
      target.requestedSpaceIds.every((spaceId) =>
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

export async function normalizeSkillReferenceTags(
  skillResource: SkillResource,
  auth: Authenticator,
  { transaction }: { transaction?: Transaction } = {}
): Promise<
  { instructions: string; instructionsHtml: string | null } | undefined
> {
  const workspace = auth.getNonNullableWorkspace();
  const customSkillIdByModelId = new Map<ModelId, string>(
    removeNulls(
      extractUniqueSkillReferenceIds(skillResource.instructions).map(
        (skillId) => {
          const modelId = isResourceSId("skill", skillId)
            ? getResourceIdFromSId(skillId)
            : null;

          return modelId ? [modelId, skillId] : null;
        }
      )
    )
  );

  if (customSkillIdByModelId.size === 0) {
    return;
  }

  const customSkills = await SkillConfigurationModel.findAll({
    where: {
      id: [...customSkillIdByModelId.keys()],
      workspaceId: workspace.id,
    },
    attributes: ["id", "icon", "name", "requestedSpaceIds", "status"],
    transaction,
  });
  const targets = new Map<string, SkillReferenceTarget>(
    removeNulls(
      customSkills.map((skill) => {
        const sId = customSkillIdByModelId.get(skill.id);

        return sId
          ? [
              sId,
              {
                icon: skill.icon,
                id: sId,
                name: skill.name,
                requestedSpaceIds: skill.requestedSpaceIds,
                status: skill.status,
              },
            ]
          : null;
      })
    )
  );
  for (const skillId of customSkillIdByModelId.values()) {
    if (!targets.has(skillId)) {
      targets.set(skillId, {
        icon: null,
        id: skillId,
        name: "",
        requestedSpaceIds: [],
        status: "archived",
      });
    }
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(
    auth,
    transaction
  );
  const parentRequestedSpaceIds = uniq([
    ...skillResource.requestedSpaceIds,
    globalSpace.id,
  ]);

  const instructions = replaceSkillReferenceTags(
    skillResource.instructions,
    targets,
    parentRequestedSpaceIds
  );
  const instructionsHtml =
    skillResource.instructionsHtml !== null
      ? replaceSkillReferenceTags(
          skillResource.instructionsHtml,
          targets,
          parentRequestedSpaceIds,
          { html: true }
        )
      : null;

  if (
    instructions !== skillResource.instructions ||
    instructionsHtml !== skillResource.instructionsHtml
  ) {
    return { instructions, instructionsHtml };
  }
}

export async function listReferencedSkillSpaceIds(
  resourceClass: typeof SkillResource,
  auth: Authenticator,
  instructions: string,
  excludedSkillId?: string
): Promise<ModelId[]> {
  const referencedSkillIds = extractUniqueSkillReferenceIds(
    instructions
  ).filter((skillId) => skillId !== excludedSkillId);

  if (referencedSkillIds.length === 0) {
    return [];
  }

  const referencedSkills = await resourceClass.fetchByIds(
    auth,
    referencedSkillIds
  );

  return uniq(
    referencedSkills
      .filter((skill) => skill.status === "active")
      .flatMap((skill) => skill.requestedSpaceIds)
  );
}
