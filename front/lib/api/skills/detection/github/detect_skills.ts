import {
  collectGitHubAttachments,
  findGitHubSkillDirectories,
} from "@app/lib/api/skills/detection/github/parsing";
import type {
  GitHubDetectedSkill,
  GitHubFileEntry,
  GitHubSkillDetectionError,
  GitHubSkillDirectory,
  GitHubTreeEntry,
} from "@app/lib/api/skills/detection/github/types";
import {
  GitHubBlobResponseSchema,
  GitHubTreeResponseSchema,
} from "@app/lib/api/skills/detection/github/types";
import { parseSkillMarkdown } from "@app/lib/api/skills/detection/parsing";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { parseGitHubRepoUrl } from "@app/lib/skill_detection";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Octokit } from "@octokit/core";
import type {OctokitResponse} from "@octokit/types/dist-types/OctokitResponse";

const FETCH_CONCURRENCY = 4;

async function callGitHubAPI<T>(
  fn: () => Promise<OctokitResponse<T>>,
  { owner, repo, context }: { owner: string; repo: string; context: string }
): Promise<Result<T, GitHubSkillDetectionError>> {
  try {
    const response = await fn();
    return new Ok(response.data);
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

    if (error.message.includes("rate limit")) {
      return new Err({
        type: "github_api_error",
        message: "GitHub API rate limit exceeded. Please try again later.",
      });
    }

    logger.error({ error: error.message, owner, repo }, context);

    return new Err({
      type: "github_api_error",
      message: context,
    });
  }
}

async function fetchRepoTree(
  octokit: InstanceType<typeof Octokit>,
  {
    owner,
    repo,
  }: {
    owner: string;
    repo: string;
  }
): Promise<Result<GitHubTreeEntry[], GitHubSkillDetectionError>> {
  const result = await callGitHubAPI(
    async () => octokit.request(
        "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
        { owner, repo, tree_sha: "HEAD", recursive: "1" }
      ),
    { owner, repo, context: "Failed to fetch repository tree" }
  );
  if (result.isErr()) {
    return result;
  }

  const parsed = GitHubTreeResponseSchema.safeParse(result.value);
  if (!parsed.success) {
    return new Err({
      type: "github_api_error",
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
 * Fetches a blob's raw base64 content from GitHub.
 */
export async function fetchBlobContent(
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
): Promise<Result<string, GitHubSkillDetectionError>> {
  const result = await callGitHubAPI(
    async () => octokit.request(
        "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
        { owner, repo, file_sha: fileSha }
      ),
    { owner, repo, context: "Failed to fetch file content" }
  );
  if (result.isErr()) {
    return result;
  }

  const parsed = GitHubBlobResponseSchema.safeParse(result.value);
  if (!parsed.success) {
    return new Err({
      type: "github_api_error",
      message: `Invalid blob response from GitHub: ${parsed.error.message}`,
    });
  }

  return new Ok(parsed.data.content);
}

/**
 * Parses a GitHub repo URL and creates an authenticated Octokit client.
 * Shared setup for both skill detection and import flows.
 */
export function initGitHubRepoClient({
  repoUrl,
  accessToken,
}: {
  repoUrl: string;
  accessToken?: string | null;
}): Result<
  { octokit: InstanceType<typeof Octokit>; owner: string; repo: string },
  GitHubSkillDetectionError
> {
  const parseResult = parseGitHubRepoUrl(repoUrl);
  if (parseResult.isErr()) {
    return parseResult;
  }
  const { owner, repo } = parseResult.value;
  const octokit = new Octokit(accessToken ? { auth: accessToken } : {});
  return new Ok({ octokit, owner, repo });
}

/**
 * Detects Agent Skills (https://agentskills.io/specification) in a GitHub
 * repository by scanning for SKILL.md files via the Git Trees API.
 */
export async function detectSkillsFromGitHubRepo({
  octokit,
  owner,
  repo,
}: {
  octokit: InstanceType<typeof Octokit>;
  owner: string;
  repo: string;
}): Promise<Result<GitHubDetectedSkill[], GitHubSkillDetectionError>> {
  const treeResult = await fetchRepoTree(octokit, { owner, repo });
  if (treeResult.isErr()) {
    return treeResult;
  }
  const tree = treeResult.value;

  const { skillDirs, fileEntries } = findGitHubSkillDirectories(tree);
  if (skillDirs.length === 0) {
    return new Ok([]);
  }

  const results = await concurrentExecutor(
    skillDirs,
    async (skillDir) =>
      buildDetectedSkill({
        octokit,
        owner,
        repo,
        skillDir,
        fileEntries,
      }),
    { concurrency: FETCH_CONCURRENCY }
  );

  const skills: GitHubDetectedSkill[] = [];
  for (const result of results) {
    if (result.isOk()) {
      skills.push(result.value);
    }
  }

  return new Ok(skills.filter((s) => s.name.length > 0));
}

async function buildDetectedSkill({
  octokit,
  owner,
  repo,
  skillDir,
  fileEntries,
}: {
  octokit: InstanceType<typeof Octokit>;
  owner: string;
  repo: string;
  skillDir: GitHubSkillDirectory;
  fileEntries: GitHubFileEntry[];
}): Promise<Result<GitHubDetectedSkill, GitHubSkillDetectionError>> {
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
  const parsed = parseSkillMarkdown(
    Buffer.from(blobResult.value, "base64").toString("utf-8")
  );

  return new Ok({
    name: parsed.name,
    skillMdPath: skillDir.skillMdPath,
    description: parsed.description,
    instructions: parsed.instructions,
    attachments: collectGitHubAttachments(fileEntries, skillDir),
  });
}

export function isSkillFromGitHubRepo(
  skill: SkillResource,
  { repoUrl }: { repoUrl: string }
): boolean {
  return skill.source === "github" && skill.sourceMetadata?.repoUrl === repoUrl;
}
