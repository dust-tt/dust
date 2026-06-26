import { uploadBase64DataToFileStorage } from "@app/lib/api/files/upload";
import { suggestMCPServersForDetectedSkill } from "@app/lib/api/skills/detection/suggest_mcp_servers";
import { validateSkillsForImport } from "@app/lib/api/skills/detection/validate_skills";
import {
  createZipAttachmentReader,
  detectSkillsFromZip,
} from "@app/lib/api/skills/detection/zip/detect_skills";
import type { ZipDetectedSkill } from "@app/lib/api/skills/detection/zip/types";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import { FileResource } from "@app/lib/resources/file_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { SkillSourceType } from "@app/types/assistant/skill_configuration";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type formidable from "formidable";
import { readFile, unlink } from "fs/promises";
import path from "path";

const FILE_IMPORT_CONCURRENCY = 4;

const IMPORT_CONFLICT_STRATEGIES = ["error", "skip", "override"] as const;

export type ImportConflictStrategyType =
  (typeof IMPORT_CONFLICT_STRATEGIES)[number];

export function isImportConflictStrategy(
  value: string
): value is ImportConflictStrategyType {
  return IMPORT_CONFLICT_STRATEGIES.includes(
    value as ImportConflictStrategyType
  );
}

type FileImportSource = Extract<SkillSourceType, "api" | "local_file">;

type ImportSkillsResult = {
  imported: SkillResource[];
  updated: SkillResource[];
  skipped: { name: string; message: string }[];
};

/**
 * Imports skills from uploaded files. Detects skills from the files,
 * uploads their attachments, then creates or updates SkillResource objects.
 *
 * `onConflict` controls what happens when a skill name collides with an
 * existing skill from a different source:
 *  - "skip": the conflicting skill is skipped and reported in `skipped`.
 *  - "error": the entire import is rejected upfront (no partial writes).
 */
export async function importSkillsFromFiles(
  auth: Authenticator,
  {
    uploadedFiles,
    names,
    editors,
    source = "local_file",
    onConflict = "skip",
  }: {
    uploadedFiles: formidable.File[];
    names?: string[];
    editors?: string[];
    source?: FileImportSource;
    onConflict?: ImportConflictStrategyType;
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

  const requestedSet = names ? new Set(names) : null;
  const selectedSkills = allSkills.filter(
    (skill) =>
      skill.name &&
      skill.instructions.trim() &&
      (!requestedSet || requestedSet.has(skill.name))
  );

  const uniqueNames = [...new Set(selectedSkills.map((s) => s.name))];
  const existingSkills = await SkillResource.fetchByNames(auth, uniqueNames);

  if (onConflict === "error") {
    // Validate all skills upfront, fail as a unit on semantic problems.
    const validationResult = validateSkillsForImport({
      selectedSkills,
      requestedNames: names ?? null,
      existingSkills,
      isConflicting: (existing) => existing.source !== source,
    });
    if (validationResult.isErr()) {
      return validationResult;
    }
  }
  if (selectedSkills.length === 0) {
    return new Err(new Error("No matching importable skills found."));
  }

  const editorUsersResult = await resolveEditorUsersFromEmails(
    auth,
    editors ?? []
  );
  if (editorUsersResult.isErr()) {
    return editorUsersResult;
  }
  const editorUsers = editorUsersResult.value;

  const user = auth.user();
  const imported: SkillResource[] = [];
  const updated: SkillResource[] = [];
  const skipped: { name: string; message: string }[] = [];

  const existingSkillsMap = new Map(existingSkills.map((s) => [s.name, s]));

  for (const skill of selectedSkills) {
    const existing = existingSkillsMap.get(skill.name) ?? null;

    if (existing && existing.source !== source && onConflict !== "override") {
      skipped.push({
        name: skill.name,
        message: `A different skill named "${skill.name}" already exists.`,
      });
      continue;
    }

    const readEntry = readerBySkill.get(skill);
    if (!readEntry) {
      skipped.push({
        name: skill.name,
        message: "Internal error: no zip reader for skill.",
      });
      continue;
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
      { concurrency: FILE_IMPORT_CONCURRENCY }
    );

    const fileAttachments = removeNulls(uploadResults);

    if (existing) {
      const attachedKnowledge = await existing.getAttachedKnowledge(auth);

      await existing.updateSkill(auth, {
        name: skill.name,
        agentFacingDescription: skill.description,
        userFacingDescription: skill.description,
        instructions: skill.instructions,
        instructionsHtml: convertMarkdownToBlockHtml(skill.instructions),
        icon: existing.icon,
        mcpServerViews: existing.mcpServerViews,
        attachedKnowledge,
        requestedSpaceIds: existing.requestedSpaceIds,
        fileAttachments,
        source,
        sourceMetadata: { filePath: skill.skillMdPath },
      });

      await FileResource.bulkSetUseCaseMetadata(auth, fileAttachments, {
        skillId: existing.sId,
      });

      const editorsResult = await existing.upsertEditors(auth, editorUsers);
      if (editorsResult.isErr()) {
        return editorsResult;
      }

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

      const suggestedMCPServerViews = await suggestMCPServersForDetectedSkill(
        auth,
        skill
      );

      const skillResource = await SkillResource.makeNew(
        auth,
        {
          status: "active",
          name: skill.name,
          agentFacingDescription: skill.description,
          userFacingDescription: skill.description,
          instructions: skill.instructions,
          instructionsHtml: convertMarkdownToBlockHtml(skill.instructions),
          editedBy: user?.id ?? null,
          requestedSpaceIds: [],
          icon,
          source,
          sourceMetadata: { filePath: skill.skillMdPath },
          isDefault: false,
        },
        {
          mcpServerViews: suggestedMCPServerViews,
          fileAttachments,
          addCurrentUserAsEditor: auth.user() !== null,
        }
      );

      await FileResource.bulkSetUseCaseMetadata(auth, fileAttachments, {
        skillId: skillResource.sId,
      });

      const editorsResult = await skillResource.upsertEditors(
        auth,
        editorUsers
      );
      if (editorsResult.isErr()) {
        return editorsResult;
      }

      imported.push(skillResource);
    }
  }

  return new Ok({ imported, updated, skipped });
}

async function resolveEditorUsersFromEmails(
  auth: Authenticator,
  editorEmails: string[]
): Promise<Result<UserResource[], Error>> {
  const normalizedEditorEmails = [
    ...new Set(
      editorEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)
    ),
  ];

  if (normalizedEditorEmails.length === 0) {
    return new Ok([]);
  }

  const workspace = auth.getNonNullableWorkspace();
  const editorUsers = await UserResource.listUserWithExactEmails(
    workspace,
    normalizedEditorEmails
  );
  const foundEmails = new Set(editorUsers.map((u) => u.email.toLowerCase()));
  const missingEmails = normalizedEditorEmails.filter(
    (email) => !foundEmails.has(email)
  );

  if (missingEmails.length > 0) {
    return new Err(
      new Error(`Editors not found in workspace: ${missingEmails.join(", ")}`)
    );
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    users: editorUsers,
    workspace,
  });
  const membershipByUserId = new Map(
    memberships.map((membership) => [membership.userId, membership])
  );
  const nonBuilderEmails = editorUsers
    .filter((user) => !membershipByUserId.get(user.id)?.isBuilder)
    .map((user) => user.email);

  if (nonBuilderEmails.length > 0) {
    return new Err(
      new Error(
        `Editors must be workspace builders: ${nonBuilderEmails.join(", ")}`
      )
    );
  }

  return new Ok(editorUsers);
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
