export type DetectedSkillStatus =
  | "ready"
  | "name_conflict"
  | "same_source_conflict"
  | "invalid";

export function isImportableSkillStatus(
  status: DetectedSkillStatus
): boolean {
  return status === "ready" || status === "same_source_conflict";
}

export function isSkillFromSameGitHubRepo(
  skill: { source: string | null; sourceMetadata: { repoUrl: string } | null },
  { repoUrl }: { repoUrl: string }
): boolean {
  return (
    skill.source === "github" && skill.sourceMetadata?.repoUrl === repoUrl
  );
}

export interface DetectedSkillSummary {
  name: string;
  status: DetectedSkillStatus;
  existingSkillId: string | null;
}
