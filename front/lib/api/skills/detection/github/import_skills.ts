import { uploadBase64DataToFileStorage } from "@app/lib/api/files/upload";
import {
  detectSkillsFromGitHubRepo,
  fetchBlobContent,
  initGitHubRepoClient,
  isSkillFromGitHubRepo,
} from "@app/lib/api/skills/detection/github/detect_skills";
import { getWorkspaceLevelGitHubAccessToken } from "@app/lib/api/skills/detection/github/github_auth";
import type {
  GitHubDetectedSkillAttachment,
  GitHubSkillDetectionError,
} from "@app/lib/api/skills/detection/github/types";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Octokit } from "@octokit/core";
import path from "path";

const IMPORT_CONCURRENCY = 4;

export interface ImportSkillsResult {
  imported: SkillResource[];
  updated: SkillResource[];
  errors: { name: string; message: string }[];
}

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

  const detectedSkills = result.value;

  const requestedNames = new Set(names);
  const selectedSkills = detectedSkills.filter(
    (skill) =>
      requestedNames.has(skill.name) && skill.name && skill.instructions.trim()
  );

  const user = auth.getNonNullableUser();
  const imported: SkillResource[] = [];
  const updated: SkillResource[] = [];
  const errors: { name: string; message: string }[] = [];

  await concurrentExecutor(
    selectedSkills,
    async (skill) => {
      const existing = await SkillResource.fetchActiveByName(auth, skill.name);

      if (existing && !isSkillFromGitHubRepo(existing, { repoUrl })) {
        errors.push({
          name: skill.name,
          message: `A different skill named "${skill.name}" already exists.`,
        });
        return;
      }

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

      const fileAttachments = uploadResults.filter(
        (r): r is FileResource => r !== null
      );

      if (existing) {
        const attachedKnowledge = await existing.getAttachedKnowledge(auth);

        await existing.updateSkill(auth, {
          name: skill.name,
          agentFacingDescription: skill.description,
          userFacingDescription: skill.description,
          instructions: skill.instructions,
          icon: existing.icon,
          mcpServerViews: existing.mcpServerViews,
          attachedKnowledge,
          requestedSpaceIds: existing.requestedSpaceIds,
          fileAttachments,
          source: "github",
          sourceMetadata: {
            repoUrl,
            filePath: skill.skillMdPath,
          },
        });

        updated.push(existing);
      } else {
        let icon: string | null = null;
        const iconResult = await getSkillIconSuggestion(auth, {
          name: skill.name,
          instructions: skill.instructions,
          agentFacingDescription: skill.description,
        });
        if (iconResult.isOk()) {
          icon = iconResult.value;
        } else {
          logger.warn(
            { error: iconResult.error, skillName: skill.name },
            "Failed to generate icon suggestion for imported skill"
          );
        }

        const skillResource = await SkillResource.makeNew(
          auth,
          {
            status: "active",
            name: skill.name,
            agentFacingDescription: skill.description,
            userFacingDescription: skill.description,
            instructions: skill.instructions,
            editedBy: user.id,
            requestedSpaceIds: [],
            extendedSkillId: null,
            icon,
            source: "github",
            sourceMetadata: {
              repoUrl,
              filePath: skill.skillMdPath,
            },
            isDefault: false,
          },
          { mcpServerViews: [], fileAttachments }
        );

        imported.push(skillResource);
      }
    },
    { concurrency: IMPORT_CONCURRENCY }
  );

  return new Ok({ imported, updated, errors });
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
