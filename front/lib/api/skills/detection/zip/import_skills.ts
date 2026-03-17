import type { ImportSkillsResult } from "@app/lib/api/skills/detection/github/import_skills";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type formidable from "formidable";

import { detectSkillsFromUploadedFiles } from "./file_detection";

const IMPORT_CONCURRENCY = 4;

interface FileImportError {
  type: "invalid_files";
  message: string;
}

/**
 * Imports skills from uploaded files. Detects skills from the files,
 * then creates or updates SkillResource objects.
 */
export async function importSkillsFromFiles(
  auth: Authenticator,
  {
    uploadedFiles,
    names,
  }: {
    uploadedFiles: formidable.File[];
    names: string[];
  }
): Promise<Result<ImportSkillsResult, FileImportError>> {
  const detectResult = await detectSkillsFromUploadedFiles(uploadedFiles);
  if (detectResult.isErr()) {
    return new Err({
      type: "invalid_files",
      message: detectResult.error.message,
    });
  }

  const detectedSkills = detectResult.value;

  const requestedNames = new Set(names);
  const selectedSkills = detectedSkills.filter(
    (skill) =>
      skill.name && skill.instructions.trim() && requestedNames.has(skill.name)
  );

  const user = auth.getNonNullableUser();
  const imported: SkillResource[] = [];
  const updated: SkillResource[] = [];
  const errors: { name: string; message: string }[] = [];

  await concurrentExecutor(
    selectedSkills,
    async (skill) => {
      const existing = await SkillResource.fetchActiveByName(auth, skill.name);

      if (existing && existing.source !== "local_file") {
        errors.push({
          name: skill.name,
          message: `A different skill named "${skill.name}" already exists.`,
        });
        return;
      }

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
          source: "local_file",
          sourceMetadata: undefined,
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
            source: "local_file",
            sourceMetadata: null,
            isDefault: false,
          },
          { mcpServerViews: [] }
        );

        imported.push(skillResource);
      }
    },
    { concurrency: IMPORT_CONCURRENCY }
  );

  return new Ok({ imported, updated, errors });
}
