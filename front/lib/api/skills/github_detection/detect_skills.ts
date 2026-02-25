import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Octokit } from "@octokit/core";

import type {
  DetectedSkill,
  DetectedSkillAttachment,
  GitHubTreeEntry,
  GitHubTreeResponse,
  SkillDetectionError,
  SkillDirectory,
} from "./types";
import {
  extractDescription,
  findSkillDirectories,
  getContentType,
  parseGitHubRepoUrl,
} from "./parsing";

export type { DetectedSkill, DetectedSkillAttachment, SkillDetectionError };
export { parseGitHubRepoUrl };

const FETCH_CONCURRENCY = 4;

/**
 * Detects skills in a GitHub repository by fetching its tree and looking for
 * directories containing skill.md or SKILL.md files.
 *
 * Does not clone the repository — uses the GitHub Git Trees API for lightweight access.
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

  // Fetch the full repository tree.
  let tree: GitHubTreeEntry[];
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      {
        owner,
        repo,
        tree_sha: "HEAD",
        recursive: "1",
      }
    );
    const data = response.data as GitHubTreeResponse;
    tree = data.tree;

    if (data.truncated) {
      logger.warn(
        { owner, repo },
        "GitHub tree response was truncated; some skills may be missed."
      );
    }
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

  // Find directories that contain a skill.md / SKILL.md at their root.
  const skillDirs = findSkillDirectories(tree);

  if (skillDirs.length === 0) {
    return new Ok([]);
  }

  // Fetch skill.md content for each detected skill directory.
  const skills = await concurrentExecutor(
    skillDirs,
    async (skillDir) => {
      return fetchSkillFromDirectory({
        octokit,
        owner,
        repo,
        skillDir,
        tree,
      });
    },
    { concurrency: FETCH_CONCURRENCY }
  );

  // Filter out failed fetches.
  const detectedSkills: DetectedSkill[] = [];
  for (const result of skills) {
    if (result.isOk()) {
      detectedSkills.push(result.value);
    }
  }

  return new Ok(detectedSkills);
}

/**
 * Fetches skill details from a detected skill directory.
 */
async function fetchSkillFromDirectory({
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
  // Fetch the skill.md content.
  let instructions: string;
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
      {
        owner,
        repo,
        file_sha: skillDir.skillMdSha,
      }
    );
    const data = response.data as { content: string; encoding: string };
    instructions = Buffer.from(data.content, "base64").toString("utf-8");
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { err: error, owner, repo, skillMdPath: skillDir.skillMdPath },
      "Failed to fetch skill.md content."
    );
    return new Err({
      type: "api_error",
      message: `Failed to fetch ${skillDir.skillMdPath}: ${error.message}`,
    });
  }

  // Extract the skill name from the directory path.
  const name = skillDir.dirPath.split("/").pop() ?? skillDir.dirPath;

  // Extract description from the skill.md content.
  const description = extractDescription(instructions);

  // Collect attachments: all other files in the skill directory (files in
  // subdirectories relative to the skill dir are included — they are part of the skill).
  const attachments: DetectedSkillAttachment[] = [];
  const dirPrefix = skillDir.dirPath ? `${skillDir.dirPath}/` : "";

  for (const entry of tree) {
    if (entry.type !== "blob") {
      continue;
    }

    // Must be inside the skill directory.
    if (!entry.path.startsWith(dirPrefix)) {
      continue;
    }

    // Skip the skill.md file itself.
    if (entry.path === skillDir.skillMdPath) {
      continue;
    }

    const relativePath = entry.path.slice(dirPrefix.length);
    const fileName = relativePath.split("/").pop() ?? relativePath;

    attachments.push({
      name: fileName,
      path: relativePath,
      sizeBytes: entry.size ?? 0,
      contentType: getContentType(fileName),
    });
  }

  return new Ok({
    name,
    dirPath: skillDir.dirPath,
    description,
    instructions,
    attachments,
  });
}
