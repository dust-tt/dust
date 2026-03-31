import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Pre-validates detected skills before any writes happen.
 * Checks: requested names exist, no duplicates, no source conflicts.
 * Returns the filtered list of valid skills or an Error.
 */
export function validateSkillsForImport<T extends DetectedSkill>({
  selectedSkills,
  requestedNames,
  existingSkills,
  isConflicting,
}: {
  selectedSkills: T[];
  requestedNames: string[] | null;
  existingSkills: SkillResource[];
  isConflicting: (existing: SkillResource) => boolean;
}): Result<T[], Error> {
  const messages: string[] = [];

  if (selectedSkills.length === 0) {
    return new Err(new Error("No matching importable skills found."));
  }

  // Check for requested names not found among detected skills.
  if (requestedNames) {
    const selectedNames = new Set(selectedSkills.map((s) => s.name));
    for (const name of requestedNames) {
      if (!selectedNames.has(name)) {
        messages.push(`Skill "${name}" not found in the archive.`);
      }
    }
  }

  // Check for duplicate names within the selection.
  const seenNames = new Set<string>();
  const duplicateNames = new Set<string>();
  for (const skill of selectedSkills) {
    if (seenNames.has(skill.name)) {
      duplicateNames.add(skill.name);
    }
    seenNames.add(skill.name);
  }
  for (const name of duplicateNames) {
    messages.push(`Duplicate skill "${name}" in the archive.`);
  }

  // Check for source conflicts with existing skills.
  for (const existing of existingSkills) {
    if (isConflicting(existing)) {
      messages.push(
        `A different skill named "${existing.name}" already exists.`
      );
    }
  }

  if (messages.length > 0) {
    return new Err(new Error(messages.join(" ")));
  }

  return new Ok(selectedSkills);
}
