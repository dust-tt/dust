import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

export type SkillUrlParseError = { type: "invalid_url"; message: string };

/**
 * Parses a GitHub repository identifier from various formats:
 * - "owner/repo"
 * - "https://github.com/owner/repo"
 * - "https://github.com/owner/repo.git"
 */
export function parseGitHubRepoUrl(
  input: string
): Result<{ owner: string; repo: string }, SkillUrlParseError> {
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
    return new Err({
      type: "invalid_url",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }

  if (url.hostname !== "github.com") {
    return new Err({
      type: "invalid_url",
      message: `Unsupported hostname "${url.hostname}". Only github.com repositories are supported.`,
    });
  }

  const segments = url.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2 || !segments[0] || !segments[1]) {
    return new Err({
      type: "invalid_url",
      message: `Invalid GitHub repository identifier: "${input}". Expected "owner/repo".`,
    });
  }

  return new Ok({ owner: segments[0], repo: segments[1] });
}
