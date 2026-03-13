import {
  detectSkillsFromGitHubRepo,
  fetchSkillFileAttachments,
  initGitHubRepoClient,
  isSkillFromGitHubRepo,
} from "@app/lib/api/skills/detection/github/detect_skills";
import { getWorkspaceLevelGitHubAccessToken } from "@app/lib/api/skills/detection/github/github_auth";
import type { GitHubSkillDetectionError } from "@app/lib/api/skills/detection/github/types";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

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

      const fileAttachments = await fetchSkillFileAttachments(auth, skill, {
        octokit,
        owner,
        repo,
      });

      let skillSId: string;

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

        skillSId = existing.sId;
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

        skillSId = skillResource.sId;
        imported.push(skillResource);
      }

      if (fileAttachments.length > 0) {
        await FileResource.bulkSetUseCaseMetadata(auth, fileAttachments, {
          skillId: skillSId,
        });
      }
    },
    { concurrency: IMPORT_CONCURRENCY }
  );

  return new Ok({ imported, updated, errors });
}
