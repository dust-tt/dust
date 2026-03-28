import { uploadBase64DataToFileStorage } from "@app/lib/api/files/upload";
import {
  createZipAttachmentReader,
  detectSkillsFromZip,
} from "@app/lib/api/skills/detection/zip/detect_skills";
import type { ZipDetectedSkill } from "@app/lib/api/skills/detection/zip/types";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type formidable from "formidable";
import { readFile, unlink } from "fs/promises";
import path from "path";

const IMPORT_CONCURRENCY = 4;

type ImportSkillsResult = {
  imported: SkillResource[];
  updated: SkillResource[];
  errored: { name: string; message: string }[];
};

/**
 * Imports skills from uploaded files. Detects skills from the files,
 * uploads their attachments, then creates or updates SkillResource objects.
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
): Promise<Result<ImportSkillsResult, Error>> {
  const allSkills: ZipDetectedSkill[] = [];

  // Readers are keyed by skill to avoid re-opening the same zip for each
  // attachment. Each zip buffer produces one reader shared across its skills.
  const readerBySkill = new Map<
    ZipDetectedSkill,
    (originalEntryName: string) => Result<Buffer, Error>
  >();

  for (const file of uploadedFiles) {
    const buffer = await readFile(file.filepath);
    await unlink(file.filepath).catch(() => {});

    const detectResult = detectSkillsFromZip({ zipBuffer: buffer });
    if (detectResult.isErr()) {
      await cleanupTempFiles(uploadedFiles);
      return new Err(new Error(detectResult.error.message));
    }

    const readerResult = createZipAttachmentReader(buffer);
    if (readerResult.isErr()) {
      await cleanupTempFiles(uploadedFiles);
      return new Err(readerResult.error);
    }
    const reader = readerResult.value;

    for (const skill of detectResult.value) {
      allSkills.push(skill);
      readerBySkill.set(skill, reader);
    }
  }

  const requestedNames = new Set(names);
  const selectedSkills = allSkills.filter(
    (skill) =>
      skill.name && skill.instructions.trim() && requestedNames.has(skill.name)
  );

  const user = auth.getNonNullableUser();
  const imported: SkillResource[] = [];
  const updated: SkillResource[] = [];
  const errored: { name: string; message: string }[] = [];

  await concurrentExecutor(
    selectedSkills,
    async (skill) => {
      const existing = await SkillResource.fetchActiveByName(auth, skill.name);

      if (existing && existing.source !== "local_file") {
        errored.push({
          name: skill.name,
          message: `A different skill named "${skill.name}" already exists.`,
        });
        return;
      }

      const readEntry = readerBySkill.get(skill);
      if (!readEntry) {
        errored.push({
          name: skill.name,
          message: "Internal error: no zip reader for skill.",
        });
        return;
      }

      const skillDirPath = path.dirname(skill.skillMdPath);
      const uploadResults = await concurrentExecutor(
        skill.attachments,
        (attachment) =>
          uploadAttachment(auth, {
            originalEntryName: attachment.originalEntryName,
            contentType: attachment.contentType,
            fileName: path.relative(skillDirPath, attachment.path),
            readEntry,
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
          source: "local_file",
          sourceMetadata: { filePath: skill.skillMdPath },
        });

        await FileResource.bulkSetUseCaseMetadata(auth, fileAttachments, {
          skillId: existing.sId,
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
            sourceMetadata: { filePath: skill.skillMdPath },
            isDefault: false,
          },
          { mcpServerViews: [], fileAttachments }
        );

        await FileResource.bulkSetUseCaseMetadata(auth, fileAttachments, {
          skillId: skillResource.sId,
        });

        imported.push(skillResource);
      }
    },
    { concurrency: IMPORT_CONCURRENCY }
  );

  return new Ok({ imported, updated, errored });
}

async function uploadAttachment(
  auth: Authenticator,
  {
    originalEntryName,
    contentType,
    fileName,
    readEntry,
  }: {
    originalEntryName: string;
    contentType: ZipDetectedSkill["attachments"][number]["contentType"];
    fileName: string;
    readEntry: (originalEntryName: string) => Result<Buffer, Error>;
  }
): Promise<FileResource | null> {
  const contentResult = readEntry(originalEntryName);
  if (contentResult.isErr()) {
    logger.error(
      { error: contentResult.error, originalEntryName },
      "Failed to read attachment from ZIP."
    );
    return null;
  }

  const uploadResult = await uploadBase64DataToFileStorage(auth, {
    base64: contentResult.value.toString("base64"),
    contentType,
    fileName,
    useCase: "skill_attachment",
  });
  if (uploadResult.isErr()) {
    logger.error(
      { error: uploadResult.error, originalEntryName },
      "Failed to upload attachment to file storage."
    );
    return null;
  }

  return uploadResult.value;
}

async function cleanupTempFiles(files: formidable.File[]): Promise<void> {
  await concurrentExecutor(files, (f) => unlink(f.filepath).catch(() => {}), {
    concurrency: 8,
  });
}
