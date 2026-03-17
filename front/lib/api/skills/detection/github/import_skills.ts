import { uploadBase64DataToFileStorage } from "@app/lib/api/files/upload";
import {
  detectSkillsFromGitHubRepo,
  isSkillFromGitHubRepo,
} from "@app/lib/api/skills/detection/github/detect_skills";
import {
  fetchBlobContent,
  initGitHubRepoClient,
} from "@app/lib/api/skills/detection/github/github_api";
import { getWorkspaceLevelGitHubAccessToken } from "@app/lib/api/skills/detection/github/github_auth";
import type {
  GitHubDetectedSkillAttachment,
  GitHubSkillDetectionError,
} from "@app/lib/api/skills/detection/github/types";
import { importDetectedSkills } from "@app/lib/api/skills/detection/import_detected_skills";
import type { ImportSkillsResult } from "@app/lib/api/skills/detection/types";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Octokit } from "@octokit/core";
import path from "path";

const IMPORT_CONCURRENCY = 4;

/**
 * Imports skills from a GitHub repository. Detects skills, fetches their
 * attachments, and creates or updates SkillResource objects.
 */
export async function importSkillsFromGitHub(
  auth: Authenticator,
  {
    repoUrl,
    names,
  }: {
    repoUrl: string;
    names: string[];
  }
): Promise<Result<ImportSkillsResult, GitHubSkillDetectionError>> {
  const accessToken = await getWorkspaceLevelGitHubAccessToken(auth);
  const clientResult = initGitHubRepoClient({ repoUrl, accessToken });
  if (clientResult.isErr()) {
    return clientResult;
  }
  const { octokit, owner, repo } = clientResult.value;

  const result = await detectSkillsFromGitHubRepo({ octokit, owner, repo });
  if (result.isErr()) {
    return result;
  }

  const importResult = await importDetectedSkills(auth, {
    detectedSkills: result.value,
    names,
    source: "github",
    isFromSameSource: (existing) =>
      isSkillFromGitHubRepo(existing, { repoUrl }),
    getSourceMetadata: (skill) => ({
      repoUrl,
      filePath: skill.skillMdPath,
    }),
    getFileAttachments: async (skill) => {
      const skillDirPath = path.dirname(skill.skillMdPath);
      const uploadResults = await concurrentExecutor(
        skill.attachments,
        (attachment) =>
          uploadAttachment(auth, {
            octokit,
            owner,
            repo,
            attachment,
            skillDirPath,
          }),
        { concurrency: IMPORT_CONCURRENCY }
      );

      return uploadResults.filter(
        (r): r is FileResource => r !== null
      );
    },
  });

  return new Ok(importResult);
}

async function uploadAttachment(
  auth: Authenticator,
  {
    octokit,
    owner,
    repo,
    attachment,
    skillDirPath,
  }: {
    octokit: InstanceType<typeof Octokit>;
    owner: string;
    repo: string;
    attachment: GitHubDetectedSkillAttachment;
    skillDirPath: string;
  }
): Promise<FileResource | null> {
  const blobResult = await fetchBlobContent(octokit, {
    owner,
    repo,
    fileSha: attachment.sha,
  });
  if (blobResult.isErr()) {
    logger.error(
      { error: blobResult.error, path: attachment.path, owner, repo },
      "Failed to fetch attachment blob from GitHub."
    );
    return null;
  }

  const fileName = path.relative(skillDirPath, attachment.path);

  const uploadResult = await uploadBase64DataToFileStorage(auth, {
    base64: blobResult.value,
    contentType: attachment.contentType,
    fileName,
    useCase: "skill_attachment",
  });
  if (uploadResult.isErr()) {
    logger.error(
      { error: uploadResult.error, path: attachment.path },
      "Failed to upload attachment to file storage."
    );
    return null;
  }

  return uploadResult.value;
}
