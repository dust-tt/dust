import { detectSkillsFromUploadedFiles } from "@app/lib/api/skills/detection/files/detect_skills";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type formidable from "formidable";

const IMPORT_CONCURRENCY = 4;
const NO_DETECTED_SKILLS_ERROR_MESSAGE =
  "No skills found. Skills must contain a SKILL.md file with valid YAML frontmatter (see https://agentskills.io/specification).";

type FileImportSource = "api" | "local_file";

type ImportSkillsResult = {
  imported: SkillResource[];
  updated: SkillResource[];
  errored: { name: string; message: string }[];
};

/**
 * Imports skills from uploaded files. Detects skills from the files,
 * then creates or updates SkillResource objects.
 */
export async function importSkillsFromFiles(
  auth: Authenticator,
  {
    uploadedFiles,
    names,
    source = "local_file",
  }: {
    uploadedFiles: formidable.File[];
    names?: string[];
    source?: FileImportSource;
  }
): Promise<Result<ImportSkillsResult, Error>> {
  const detectResult = await detectSkillsFromUploadedFiles(uploadedFiles);
  if (detectResult.isErr()) {
    return detectResult;
  }

  const detectedSkills = detectResult.value;
  if (detectedSkills.length === 0) {
    return new Err(new Error(NO_DETECTED_SKILLS_ERROR_MESSAGE));
  }

  const requestedNames = names ? new Set(names) : null;
  const selectedSkills = detectedSkills.filter(
    (skill) =>
      skill.name &&
      skill.instructions.trim() &&
      (!requestedNames || requestedNames.has(skill.name))
  );
  if (selectedSkills.length === 0) {
    return new Err(new Error("No matching importable skills found."));
  }

  const user = auth.getNonNullableUser();
  const imported: SkillResource[] = [];
  const updated: SkillResource[] = [];
  const errored: { name: string; message: string }[] = [];

  await concurrentExecutor(
    selectedSkills,
    async (skill) => {
      const existing = await SkillResource.fetchActiveByName(auth, skill.name);

      if (existing && existing.source !== source) {
        errored.push({
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
          source,
          sourceMetadata: { filePath: skill.skillMdPath },
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
            source,
            sourceMetadata: { filePath: skill.skillMdPath },
            isDefault: false,
          },
          { mcpServerViews: [] }
        );

        imported.push(skillResource);
      }
    },
    { concurrency: IMPORT_CONCURRENCY }
  );

  return new Ok({ imported, updated, errored });
}
