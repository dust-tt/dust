import {
  findSkillDirectories,
  parseGitHubRepoUrl,
  parseSkillMarkdown,
} from "@app/lib/api/skills/github_detection/parsing";
import type {
  DetectedSkill,
  DetectedSkillAttachment,
  GitHubTreeEntry,
  SkillDetectionError,
  SkillDirectory,
} from "@app/lib/api/skills/github_detection/types";
import {
  GitHubBlobResponseSchema,
  GitHubTreeResponseSchema,
} from "@app/lib/api/skills/github_detection/types";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Octokit } from "@octokit/core";

const FETCH_CONCURRENCY = 4;

async function fetchRepoTree(
  octokit: InstanceType<typeof Octokit>,
  {
    owner,
    repo,
  }: {
    owner: string;
    repo: string;
  }
): Promise<Result<GitHubTreeEntry[], SkillDetectionError>> {
  let rawData: unknown;
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      { owner, repo, tree_sha: "HEAD", recursive: "1" }
    );
    rawData = response.data;
  } catch (err) {
    const error = normalizeError(err);
    if (error.message.includes("Not Found")) {
      return new Err({
        type: "not_found",
        message: `Repository "${owner}/${repo}" not found.`,
      });
    }
    if (
      error.message.includes("Bad credentials") ||
      error.message.includes("401")
    ) {
      return new Err({
        type: "auth_error",
        message: `Authentication failed for repository "${owner}/${repo}".`,
      });
    }
    return new Err({
      type: "api_error",
      message: `Failed to fetch repository tree: ${error.message}`,
    });
  }

  const parsed = GitHubTreeResponseSchema.safeParse(rawData);
  if (!parsed.success) {
    return new Err({
      type: "api_error",
      message: `Invalid tree response from GitHub: ${parsed.error.message}`,
    });
  }

  if (parsed.data.truncated) {
    logger.warn(
      { owner, repo },
      "GitHub tree response was truncated; some skills may be missed."
    );
  }

  return new Ok(parsed.data.tree);
}

/**
 * Fetches a blob's content from GitHub and returns it as a UTF-8 string.
 */
async function fetchBlobContent(
  octokit: InstanceType<typeof Octokit>,
  {
    owner,
    repo,
    fileSha,
  }: {
    owner: string;
    repo: string;
    fileSha: string;
  }
): Promise<Result<string, SkillDetectionError>> {
  let rawData: unknown;
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
      { owner, repo, file_sha: fileSha }
    );
    rawData = response.data;
  } catch (err) {
    return new Err({
      type: "api_error",
      message: `Failed to fetch blob: ${normalizeError(err).message}`,
    });
  }

  const parsed = GitHubBlobResponseSchema.safeParse(rawData);
  if (!parsed.success) {
    return new Err({
      type: "api_error",
      message: `Invalid blob response from GitHub: ${parsed.error.message}`,
    });
  }

  return new Ok(Buffer.from(parsed.data.content, "base64").toString("utf-8"));
}

/**
 * Detects Agent Skills (https://agentskills.io/specification) in a GitHub
 * repository by scanning for SKILL.md files via the Git Trees API.
 */
export async function detectSkillsFromGitHubRepo({
  repoUrl,
  accessToken,
}: {
  repoUrl: string;
  accessToken?: string;
}): Promise<Result<DetectedSkill[], SkillDetectionError>> {
  const parseResult = parseGitHubRepoUrl(repoUrl);
  if (parseResult.isErr()) {
    return parseResult;
  }
  const { owner, repo } = parseResult.value;

  const octokit = new Octokit(accessToken ? { auth: accessToken } : {});

  const treeResult = await fetchRepoTree(octokit, { owner, repo });
  if (treeResult.isErr()) {
    return treeResult;
  }
  const tree = treeResult.value;

  const skillDirs = findSkillDirectories(tree);
  if (skillDirs.length === 0) {
    return new Ok([]);
  }

  const skills = await concurrentExecutor(
    skillDirs,
    async (skillDir) =>
      buildDetectedSkill({ octokit, owner, repo, skillDir, tree }),
    { concurrency: FETCH_CONCURRENCY }
  );

  const detectedSkills: DetectedSkill[] = [];
  const seenNames = new Set<string>();
  for (const result of skills) {
    if (result.isErr()) {
      continue;
    }
    const skill = result.value;
    if (!skill.name || seenNames.has(skill.name)) {
      continue;
    }
    seenNames.add(skill.name);
    detectedSkills.push(skill);
  }

  return new Ok(detectedSkills);
}

async function buildDetectedSkill({
  octokit,
  owner,
  repo,
  skillDir,
  tree,
}: {
  octokit: InstanceType<typeof Octokit>;
  owner: string;
  repo: string;
  skillDir: SkillDirectory;
  tree: GitHubTreeEntry[];
}): Promise<Result<DetectedSkill, SkillDetectionError>> {
  const blobResult = await fetchBlobContent(octokit, {
    owner,
    repo,
    fileSha: skillDir.skillMdSha,
  });
  if (blobResult.isErr()) {
    logger.error(
      {
        error: blobResult.error,
        owner,
        repo,
        skillMdPath: skillDir.skillMdPath,
      },
      "Failed to fetch skill.md content."
    );
    return blobResult;
  }
  const parsed = parseSkillMarkdown(blobResult.value);

  const attachments: DetectedSkillAttachment[] = [];
  const lastSlash = skillDir.skillMdPath.lastIndexOf("/");
  const dirPrefix = skillDir.skillMdPath.slice(0, lastSlash + 1);

  for (const entry of tree) {
    if (entry.type !== "blob") {
      continue;
    }
    if (!entry.path.startsWith(dirPrefix)) {
      continue;
    }
    if (entry.path === skillDir.skillMdPath) {
      continue;
    }

    const relativePath = entry.path.slice(dirPrefix.length);

    attachments.push({
      path: relativePath,
      sizeBytes: entry.size ?? 0,
    });
  }

  return new Ok({
    name: parsed.name,
    skillMdPath: skillDir.skillMdPath,
    description: parsed.description,
    instructions: parsed.instructions,
    attachments,
  });
}

export function isSkillFromGitHubRepo(
  skill: SkillResource,
  { repoUrl }: { repoUrl: string }
): boolean {
  return skill.source === "github" && skill.sourceMetadata?.repoUrl === repoUrl;
}
