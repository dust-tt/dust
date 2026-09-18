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
 * A change MUST pass exactly when `PATCH /skills/:sId` would accept the name from the same
 * caller: `skill.canWrite(auth)`, skill not archived, the trimmed name non-empty and within
 * `SkillNameSchema`, and no other active skill in the workspace carrying that name. The returned
 * `name` is the trimmed value the caller MUST write, never the raw input.
 */
/**
 * @cc [owner:achilleburah,label:security] name-uniqueness-checked-across-the-workspace
 * The uniqueness check MUST see every active skill in the workspace regardless of the caller's
 * read permissions, because the `(workspaceId, name, status)` unique index does: a homonym hidden
 * from the caller must fail with `already_exists`, not surface as a database error.
 */
export async function validateSkillNameChange(
  auth: Authenticator,
  skill: SkillResource,
  { name }: { name: string }
): Promise<Result<SkillNameChange, SkillNameChangeError>> {
  if (!skill.canWrite(auth)) {
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

  const trimmedName = name.trim();
  if (!trimmedName) {
    return new Err(
      new SkillNameChangeError("empty", "Skill name cannot be empty.")
    );
  }

  const parsed = SkillNameSchema.safeParse(trimmedName);
  if (!parsed.success) {
    return new Err(
      new SkillNameChangeError(
        "too_long",
        parsed.error.issues[0]?.message ?? "Skill name is too long."
      )
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
