import {
  fetchBlobContent,
  fetchRepoTree,
} from "@app/lib/api/skills/detection/github/github_api";
import {
  collectGitHubAttachments,
  findGitHubSkillDirectories,
} from "@app/lib/api/skills/detection/github/parsing";
import type {
  GitHubDetectedSkill,
  GitHubFileEntry,
  GitHubSkillDetectionError,
  GitHubSkillDirectory,
} from "@app/lib/api/skills/detection/github/types";
import { parseSkillMarkdown } from "@app/lib/api/skills/detection/parsing";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Octokit } from "@octokit/core";

const FETCH_CONCURRENCY = 4;

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
