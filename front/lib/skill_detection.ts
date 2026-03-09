export type DetectedSkillStatus =
  | "ready"
  | "name_conflict"
  | "skill_already_exists"
  | "invalid";

export type DetectedSkillSummary = {
  name: string;
  status: DetectedSkillStatus;
  existingSkillId: string | null;
};

export function isImportableSkillStatus(status: DetectedSkillStatus): boolean {
  return status === "ready" || status === "skill_already_exists";
}

/**
 * Parses a GitHub repository identifier from various formats:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "https://github.com/owner/repo.git"
 * Returns null if the input is not a valid GitHub repository identifier.
 */
export function parseGitHubRepoUrl(
  input: string
): { owner: string; repo: string } | null {
  const trimmed = input.trim();

  let normalized: string;
  if (trimmed.includes("://")) {
    normalized = trimmed;
  } else if (trimmed.startsWith("github.com/")) {
    normalized = `https://${trimmed}`;
  } else {
    normalized = `https://github.com/${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (url.hostname !== "github.com") {
    return null;
  }

  const segments = url.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2 || !segments[0] || !segments[1]) {
    return null;
  }

  return { owner: segments[0], repo: segments[1] };
}
