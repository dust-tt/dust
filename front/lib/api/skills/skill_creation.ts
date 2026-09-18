import { getSimilarSkills } from "@app/lib/api/skills/existing_skill_checker";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { findSpecialTagsPresent } from "@app/lib/api/skills/instructions_special_tags";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SkillCreationErrorCode =
  | "not_authorized"
  | "empty_name"
  | "user_facing_description_too_long"
  | "special_tags"
  | "name_taken"
  | "similar_skills_check_failed"
  | "similar_skills";

export class SkillCreationError extends Error {
  constructor(
    readonly code: SkillCreationErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface SkillCreationInput {
  name: string;
  userFacingDescription: string;
  agentFacingDescription: string;
  instructions: string;
  bypassSimilarSkillCheck?: boolean;
}

export interface ValidatedSkillCreation {
  user: UserResource;
  name: string;
}

export async function validateSkillCreation(
  auth: Authenticator,
  {
    name,
    userFacingDescription,
    agentFacingDescription,
    instructions,
    bypassSimilarSkillCheck,
  }: SkillCreationInput
): Promise<Result<ValidatedSkillCreation, SkillCreationError>> {
  const user = auth.user();
  if (!user) {
    return new Err(
      new SkillCreationError(
        "not_authorized",
        "Creating a skill requires an interactive user context."
      )
    );
  }

  if (!(await auth.hasWorkspacePermission("create", "skill"))) {
    return new Err(
      new SkillCreationError("not_authorized", "Creating skills is restricted.")
    );
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return new Err(
      new SkillCreationError("empty_name", "Skill name cannot be empty.")
    );
  }

  if (userFacingDescription.length > USER_FACING_DESCRIPTION_MAX_LENGTH) {
    return new Err(
      new SkillCreationError(
        "user_facing_description_too_long",
        `The user-facing description must be at most ${USER_FACING_DESCRIPTION_MAX_LENGTH} characters.`
      )
    );
  }

  // A new skill has no attachments, so any special tag in the instructions
  // would be dead markup. Keep created skills instructions-only.
  const specialTags = findSpecialTagsPresent(instructions);
  if (specialTags.length > 0) {
    return new Err(
      new SkillCreationError(
        "special_tags",
        `The instructions contain special tags (${specialTags.join(", ")}) ` +
          "that are wired up in the builder, not authored as plain text. Create " +
          "instructions-only skills; nested skills, knowledge, and tools must be " +
          "attached in the builder."
      )
    );
  }

  if (await SkillResource.isNameTaken(auth, trimmedName)) {
    return new Err(
      new SkillCreationError(
        "name_taken",
        `A skill with the name "${trimmedName}" already exists.`
      )
    );
  }

  if (bypassSimilarSkillCheck !== true) {
    const similarSkills = await findSimilarSkillSummaries(
      auth,
      agentFacingDescription
    );
    if (similarSkills.isErr()) {
      return new Err(similarSkills.error);
    }
    if (similarSkills.value.length > 0) {
      return new Err(
        new SkillCreationError(
          "similar_skills",
          makeSimilarSkillsErrorMessage(similarSkills.value)
        )
      );
    }
  }

  return new Ok({ user, name: trimmedName });
}

interface SimilarSkillSummary {
  sId: string;
  name: string;
  agentFacingDescription: string;
}

async function findSimilarSkillSummaries(
  auth: Authenticator,
  naturalDescription: string
): Promise<Result<SimilarSkillSummary[], SkillCreationError>> {
  const result = await getSimilarSkills(auth, {
    naturalDescription,
    excludeSkillId: null,
  });

  if (result.isErr()) {
    logger.warn(
      { err: result.error },
      "Failed to check for similar skills before creating skill"
    );
    return new Err(
      new SkillCreationError(
        "similar_skills_check_failed",
        "Could not check whether a similar skill already exists. Retry, or set " +
          "`bypassSimilarSkillCheck` to true only if the user explicitly wants " +
          "to create a separate skill."
      )
    );
  }

  const similarSkillIds = result.value.similar_skills;
  if (similarSkillIds.length === 0) {
    return new Ok([]);
  }

  const skills = await SkillResource.fetchByIds(auth, similarSkillIds);
  const skillsById = new Map<string, SkillResource>();
  for (const skill of skills) {
    skillsById.set(skill.sId, skill);
  }

  const summaries: SimilarSkillSummary[] = [];
  for (const skillId of similarSkillIds) {
    const skill = skillsById.get(skillId);
    if (skill) {
      summaries.push({
        sId: skill.sId,
        name: skill.name,
        agentFacingDescription: skill.agentFacingDescription,
      });
    }
  }

  return new Ok(summaries);
}

function makeSimilarSkillsErrorMessage(
  similarSkills: SimilarSkillSummary[]
): string {
  const summaries = similarSkills
    .map(
      (skill) =>
        `- ${skill.name} (${skill.sId}): ${skill.agentFacingDescription}`
    )
    .join("\n");

  return (
    "Similar skills already exist. Reuse or update them instead of creating a " +
    `duplicate skill:\n${summaries}\n` +
    "If the user explicitly wants a separate skill, call the tool again with " +
    "`bypassSimilarSkillCheck` set to true."
  );
}

export async function suggestSkillIconOrDefault(
  auth: Authenticator,
  inputs: {
    name: string;
    instructions: string;
    agentFacingDescription: string;
  }
): Promise<string> {
  const iconResult = await getSkillIconSuggestion(auth, inputs);
  if (iconResult.isOk()) {
    return iconResult.value;
  }

  logger.warn(
    { err: iconResult.error },
    "Failed to generate icon suggestion for skill"
  );
  return "ActionListIcon";
}
