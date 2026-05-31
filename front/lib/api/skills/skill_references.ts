import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import {
  extractUniqueSkillIds,
  parseSkillReferenceTag,
  parseSkillTag,
  SKILL_TAG_REGEX,
  serializeUnavailableSkillTag,
} from "@app/lib/skills/format";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

export type SkillInstructionsOverride = {
  instructionsOverride?: string;
};

const UNAVAILABLE_SKILL_TAG_REGEX =
  /<unavailable_skill\s+([^>]*?)\s*(?:\/>|><\/unavailable_skill>)/g;

type SkillReferenceParent = {
  contents: (string | null | undefined)[];
  requestedSpaceIds: readonly ModelId[];
};

async function fetchReferencedSkillRequestedSpaceIds(
  auth: Authenticator,
  skillIds: string[]
): Promise<Map<string, readonly ModelId[]>> {
  const workspace = auth.getNonNullableWorkspace();
  const requestedSpaceIdsBySkillId = new Map<string, readonly ModelId[]>();
  const customSkillSIdByModelId = new Map<ModelId, string>();
  const globalSkillIds: string[] = [];

  for (const skillId of skillIds) {
    if (isResourceSId("skill", skillId)) {
      const modelId = getResourceIdFromSId(skillId);
      if (modelId !== null) {
        customSkillSIdByModelId.set(modelId, skillId);
      }
    } else {
      globalSkillIds.push(skillId);
    }
  }

  const customSkillIds = [...customSkillSIdByModelId.keys()];
  if (customSkillIds.length > 0) {
    const customSkills = await SkillConfigurationModel.findAll({
      where: {
        id: customSkillIds,
        status: ["active", "archived", "suggested"],
        workspaceId: workspace.id,
      },
      attributes: ["id", "requestedSpaceIds"],
    });

    for (const skill of customSkills) {
      const sId = customSkillSIdByModelId.get(skill.id);
      if (sId) {
        requestedSpaceIdsBySkillId.set(sId, skill.requestedSpaceIds);
      }
    }
  }

  if (globalSkillIds.length > 0) {
    const [globalSkills, systemSkills] = await Promise.all([
      GlobalSkillsRegistry.findAll(auth, { sId: globalSkillIds }),
      SystemSkillsRegistry.findAll(auth, { sId: globalSkillIds }),
    ]);

    for (const skill of [...globalSkills, ...systemSkills]) {
      requestedSpaceIdsBySkillId.set(skill.sId, []);
    }
  }

  return requestedSpaceIdsBySkillId;
}

export async function getUnavailableSkillReferenceIdsByParent(
  auth: Authenticator,
  parents: SkillReferenceParent[]
): Promise<Set<string>[]> {
  const skillIdsByParent = parents.map((parent) => [
    ...new Set(
      parent.contents.flatMap((content) => extractUniqueSkillIds(content ?? ""))
    ),
  ]);

  const skillIds = [...new Set(skillIdsByParent.flat())];

  if (skillIds.length === 0) {
    return parents.map(() => new Set());
  }

  const requestedSpaceIdsBySkillId =
    await fetchReferencedSkillRequestedSpaceIds(auth, skillIds);

  return parents.map((parent, index) => {
    const parentRequestedSpaceIds = new Set(parent.requestedSpaceIds);

    return new Set(
      skillIdsByParent[index].filter((skillId) => {
        const childRequestedSpaceIds = requestedSpaceIdsBySkillId.get(skillId);

        return (
          !childRequestedSpaceIds ||
          !childRequestedSpaceIds.every((spaceId) =>
            parentRequestedSpaceIds.has(spaceId)
          )
        );
      })
    );
  });
}

export async function getUnavailableSkillReferenceIdsForParent(
  auth: Authenticator,
  parent: SkillReferenceParent
): Promise<Set<string>> {
  const [unavailableSkillIds] = await getUnavailableSkillReferenceIdsByParent(
    auth,
    [parent]
  );

  return unavailableSkillIds;
}

export function replaceUnavailableSkillReferenceTags(
  content: string,
  unavailableSkillIds: ReadonlySet<string>,
  { html = false }: { html?: boolean } = {}
): string {
  if (unavailableSkillIds.size === 0) {
    return content;
  }

  return content.replace(SKILL_TAG_REGEX, (tag) => {
    const skill = parseSkillTag(tag);

    if (!skill || !unavailableSkillIds.has(skill.id)) {
      return tag;
    }

    return serializeUnavailableSkillTag({ id: skill.id }, { html });
  });
}

export async function replaceUnavailableSkillReferences(
  auth: Authenticator,
  skill: SkillType
): Promise<SkillType> {
  const unavailableSkillIds = await getUnavailableSkillReferenceIdsForParent(
    auth,
    {
      contents: [skill.instructions, skill.instructionsHtml],
      requestedSpaceIds: removeNulls(
        skill.requestedSpaceIds.map(getResourceIdFromSId)
      ),
    }
  );

  if (unavailableSkillIds.size === 0) {
    return skill;
  }

  return {
    ...skill,
    instructions: skill.instructions
      ? replaceUnavailableSkillReferenceTags(
          skill.instructions,
          unavailableSkillIds
        )
      : skill.instructions,
    instructionsHtml: skill.instructionsHtml
      ? replaceUnavailableSkillReferenceTags(
          skill.instructionsHtml,
          unavailableSkillIds,
          {
            html: true,
          }
        )
      : skill.instructionsHtml,
  };
}

function buildSkillReferenceTagById(
  content: string | null
): Map<string, string> {
  return new Map(
    [...(content ?? "").matchAll(SKILL_TAG_REGEX)].flatMap((match) => {
      const skill = parseSkillTag(match[0]);

      return skill ? [[skill.id, match[0]]] : [];
    })
  );
}

function restoreUnavailableSkillReferencesInContent({
  currentContent,
  updatedContent,
}: {
  currentContent: string | null;
  updatedContent: string;
}): Result<string, Error> {
  const skillReferenceTagById = buildSkillReferenceTagById(currentContent);
  let invalidUnavailableSkillId: string | null = null;

  const restoredContent = updatedContent.replace(
    UNAVAILABLE_SKILL_TAG_REGEX,
    (tag) => {
      const unavailableSkill = parseSkillReferenceTag(tag);
      const skillReferenceTag = unavailableSkill
        ? skillReferenceTagById.get(unavailableSkill.id)
        : undefined;

      if (!unavailableSkill || !skillReferenceTag) {
        invalidUnavailableSkillId = unavailableSkill?.id ?? "";
        return tag;
      }

      return skillReferenceTag;
    }
  );

  if (invalidUnavailableSkillId !== null) {
    return new Err(
      new Error(
        invalidUnavailableSkillId
          ? `Unavailable skill reference ${invalidUnavailableSkillId} does not match an existing skill reference.`
          : "Unavailable skill reference does not match an existing skill reference."
      )
    );
  }

  return new Ok(restoredContent);
}

export function restoreUnavailableSkillReferencesForPersistence({
  current,
  updated,
}: {
  current: {
    instructions: string;
    instructionsHtml: string | null;
  };
  updated: {
    instructions: string;
    instructionsHtml: string | null;
  };
}): Result<
  {
    instructions: string;
    instructionsHtml: string | null;
  },
  Error
> {
  const restoredInstructions = restoreUnavailableSkillReferencesInContent({
    currentContent: current.instructions,
    updatedContent: updated.instructions,
  });
  if (restoredInstructions.isErr()) {
    return restoredInstructions;
  }

  const restoredInstructionsHtml =
    updated.instructionsHtml !== null
      ? restoreUnavailableSkillReferencesInContent({
          currentContent: current.instructionsHtml,
          updatedContent: updated.instructionsHtml,
        })
      : new Ok(null);
  if (restoredInstructionsHtml.isErr()) {
    return restoredInstructionsHtml;
  }

  return new Ok({
    instructions: restoredInstructions.value,
    instructionsHtml: restoredInstructionsHtml.value,
  });
}
