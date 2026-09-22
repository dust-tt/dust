import { SkillNameSchema } from "@app/lib/api/skills/schemas";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type SkillNameChangeErrorCode =
  | "not_authorized"
  | "archived"
  | "empty"
  | "too_long"
  | "already_exists";

export class SkillNameChangeError extends Error {
  constructor(
    readonly code: SkillNameChangeErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface SkillNameChange {
  name: string;
}

/**
 * @cc [owner:achilleburah,label:security;product] same-rules-as-manual-rename
 * A rename MUST pass exactly when a manual edit by the same caller would: caller can write the
 * skill, skill not archived, raw name within the length limit before trimming, trimmed name
 * non-empty, and no other active skill in the workspace already carrying it. The returned name
 * is always the trimmed value, never the raw input.
 */
export async function validateSkillNameChange(
  auth: Authenticator,
  skill: SkillResource,
  { name }: { name: string }
): Promise<Result<SkillNameChange, SkillNameChangeError>> {
  if (!auth.can("write", skill)) {
    return new Err(
      new SkillNameChangeError(
        "not_authorized",
        "Only editors of this skill can rename it."
      )
    );
  }

  if (skill.status === "archived") {
    return new Err(
      new SkillNameChangeError(
        "archived",
        "This skill is archived; it cannot be renamed."
      )
    );
  }

  const parsed = SkillNameSchema.safeParse(name);
  if (!parsed.success) {
    return new Err(
      new SkillNameChangeError(
        "too_long",
        parsed.error.issues[0]?.message ?? "Skill name is too long."
      )
    );
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return new Err(
      new SkillNameChangeError("empty", "Skill name cannot be empty.")
    );
  }

  if (await SkillResource.isNameTaken(auth, trimmedName, skill.id)) {
    return new Err(
      new SkillNameChangeError(
        "already_exists",
        `A skill with the name "${trimmedName}" already exists.`
      )
    );
  }

  return new Ok({ name: trimmedName });
}
