import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SKILLS_TOOLS_METADATA } from "@app/lib/api/actions/servers/skills/metadata";
import { DustFileSystem } from "@app/lib/api/file_system";
import { uploadBase64DataToFileStorage } from "@app/lib/api/files/upload";
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import { pruneOutdatedSkillEditSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { streamToBuffer } from "@app/lib/utils/streams";
import {
  contentTypeFromFileName,
  DEFAULT_FILE_CONTENT_TYPE,
  isSupportedFileContentType,
  type SupportedFileContentType,
  stripMimeParameters,
} from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { pluralize } from "@app/types/shared/utils/string_utils";
import * as path from "path";

const DEFAULT_SKILL_ICON = "ActionListIcon";

type SkillFileInput = {
  path: string;
  fileName?: string;
};

function resolveContentType({
  sourcePath,
  targetFileName,
  statContentType,
}: {
  sourcePath: string;
  targetFileName: string;
  statContentType: string;
}): SupportedFileContentType {
  const strippedStatContentType = stripMimeParameters(statContentType);

  return (
    contentTypeFromFileName(targetFileName) ??
    contentTypeFromFileName(sourcePath) ??
    (isSupportedFileContentType(strippedStatContentType)
      ? strippedStatContentType
      : DEFAULT_FILE_CONTENT_TYPE)
  );
}

function sourcePathFromSandboxPath({
  dustFs,
  sourcePath,
}: {
  dustFs: DustFileSystem;
  sourcePath: string;
}): string | null {
  for (const mount of dustFs.getMounts()) {
    const sandboxMountPoints = [
      mount.sandboxMountPoint,
      mount.legacySandboxMountPoint,
    ];

    for (const sandboxMountPoint of sandboxMountPoints) {
      if (!sandboxMountPoint) {
        continue;
      }

      if (sourcePath === sandboxMountPoint) {
        return mount.scopedPrefix;
      }

      const prefix = `${sandboxMountPoint}/`;
      if (sourcePath.startsWith(prefix)) {
        return `${mount.scopedPrefix}/${sourcePath.slice(prefix.length)}`;
      }
    }
  }

  return null;
}

function resolveSourcePath(
  dustFs: DustFileSystem,
  sourcePath: string
): Result<string, MCPError> {
  const trimmedSourcePath = sourcePath.trim();
  if (!trimmedSourcePath) {
    return new Err(
      new MCPError("Source file path cannot be empty.", { tracked: false })
    );
  }

  const scopedPath =
    sourcePathFromSandboxPath({ dustFs, sourcePath: trimmedSourcePath }) ??
    trimmedSourcePath;

  const normalized = DustFileSystem.normalizeScopedPath(scopedPath);
  if (!normalized) {
    return new Err(
      new MCPError(
        `Invalid file path: ${sourcePath}. Use a scoped file path from files__list or a sandbox path under /files/.`,
        { tracked: false }
      )
    );
  }

  return new Ok(normalized);
}

function resolveTargetFileName({
  sourcePath,
  targetFileName,
}: {
  sourcePath: string;
  targetFileName?: string;
}): Result<string, MCPError> {
  const fileName = (targetFileName ?? path.posix.basename(sourcePath)).trim();
  const segments = fileName.split("/");

  if (
    !fileName ||
    fileName.startsWith("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0") ||
    fileName.includes("\n") ||
    fileName.includes("\r") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return new Err(
      new MCPError(
        `Invalid skill attachment file name: ${targetFileName ?? fileName}. Use a relative file path such as scripts/process.py.`,
        { tracked: false }
      )
    );
  }

  return new Ok(fileName);
}

async function uploadSkillFiles(
  auth: Authenticator,
  { dustFs, files }: { dustFs: DustFileSystem; files: SkillFileInput[] }
): Promise<Result<FileResource[], MCPError>> {
  const uploadedFiles: FileResource[] = [];

  for (const file of files) {
    const sourcePathRes = resolveSourcePath(dustFs, file.path);
    if (sourcePathRes.isErr()) {
      return sourcePathRes;
    }
    const sourcePath = sourcePathRes.value;

    const targetFileNameRes = resolveTargetFileName({
      sourcePath,
      targetFileName: file.fileName,
    });
    if (targetFileNameRes.isErr()) {
      return targetFileNameRes;
    }
    const targetFileName = targetFileNameRes.value;

    const statResult = await dustFs.stat(sourcePath);
    if (statResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to read ${sourcePath}: ${statResult.error.message}`
        )
      );
    }
    if (!statResult.value) {
      return new Err(
        new MCPError(`File not found: ${sourcePath}.`, { tracked: false })
      );
    }

    const contentType = resolveContentType({
      sourcePath,
      targetFileName,
      statContentType: statResult.value.contentType,
    });

    const readResult = await dustFs.read(sourcePath);
    if (readResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to read ${sourcePath}: ${readResult.error.message}`
        )
      );
    }
    if (!readResult.value) {
      return new Err(
        new MCPError(`File not found: ${sourcePath}.`, { tracked: false })
      );
    }

    const bufferResult = await streamToBuffer(readResult.value);
    if (bufferResult.isErr()) {
      return new Err(new MCPError(bufferResult.error));
    }

    const uploadResult = await uploadBase64DataToFileStorage(auth, {
      base64: bufferResult.value.toString("base64"),
      contentType,
      fileName: targetFileName,
      useCase: "skill_attachment",
    });

    if (uploadResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to upload ${targetFileName}: ${uploadResult.error.message}`
        )
      );
    }

    uploadedFiles.push(uploadResult.value);
  }

  return new Ok(uploadedFiles);
}

function validateSkillReferences(
  auth: Authenticator,
  {
    enabled,
    instructions,
    parentSkillModelId,
  }: {
    enabled: boolean;
    instructions: string;
    parentSkillModelId?: ModelId;
  }
): Result<undefined, MCPError> {
  if (!enabled) {
    return new Ok(undefined);
  }

  const validation = SkillResource.getValidatedSkillReferenceModelIds(auth, {
    instructions,
    parentSkillId: parentSkillModelId,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message, { tracked: false }));
  }

  return new Ok(undefined);
}

const handlers: ToolHandlers<typeof SKILLS_TOOLS_METADATA> = {
  create_skill: async ({ name, description, instructions }, { auth }) => {
    if (!auth.isBuilder()) {
      return new Err(
        new MCPError("Only builders can create skills.", { tracked: false })
      );
    }
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError("User must be authenticated.", { tracked: false })
      );
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return new Err(
        new MCPError("Skill name cannot be empty.", { tracked: false })
      );
    }
    if (!instructions.trim()) {
      return new Err(
        new MCPError("Skill instructions cannot be empty.", {
          tracked: false,
        })
      );
    }

    const existingSkill = await SkillResource.fetchActiveByName(
      auth,
      trimmedName
    );
    if (existingSkill) {
      return new Err(
        new MCPError(`A skill with the name "${trimmedName}" already exists.`, {
          tracked: false,
        })
      );
    }

    const featureFlags = await getFeatureFlags(auth);
    const enableSkillReferences = featureFlags.includes("nested_skills");
    const skillReferenceValidation = validateSkillReferences(auth, {
      enabled: enableSkillReferences,
      instructions,
    });
    if (skillReferenceValidation.isErr()) {
      return skillReferenceValidation;
    }

    const skillResource = await SkillResource.makeNew(
      auth,
      {
        status: "active",
        name: trimmedName,
        agentFacingDescription: description,
        userFacingDescription: description,
        instructions,
        instructionsHtml: convertMarkdownToBlockHtml(instructions),
        editedBy: user.id,
        requestedSpaceIds: [],
        extendedSkillId: null,
        icon: DEFAULT_SKILL_ICON,
        source: "api",
        sourceMetadata: null,
        isDefault: false,
        reinforcement: "on",
      },
      {
        mcpServerViews: [],
        fileAttachments: [],
        enableSkillReferences,
      }
    );

    return new Ok([
      {
        type: "text" as const,
        text: `Created skill "${skillResource.name}".`,
      },
    ]);
  },

  edit_skill: async (
    { skillName, oldString, newString, expectedReplacements = 1 },
    { auth }
  ) => {
    const skillResource = await SkillResource.fetchActiveByName(
      auth,
      skillName.trim()
    );
    if (!skillResource) {
      return new Err(
        new MCPError(`Skill "${skillName}" not found.`, { tracked: false })
      );
    }
    if (!skillResource.canWrite(auth)) {
      return new Err(
        new MCPError("Only editors can modify this skill.", {
          tracked: false,
        })
      );
    }

    const { updatedContent: instructions, occurrences } =
      getUpdatedContentAndOccurrences({
        oldString,
        newString,
        currentContent: skillResource.instructions,
      });

    if (occurrences === 0) {
      return new Err(
        new MCPError(`String not found in skill "${skillResource.name}".`, {
          tracked: false,
        })
      );
    }

    if (occurrences !== expectedReplacements) {
      return new Err(
        new MCPError(
          `Expected ${expectedReplacements} replacements, but found ${occurrences}.`,
          { tracked: false }
        )
      );
    }

    if (!instructions.trim()) {
      return new Err(
        new MCPError("Skill instructions cannot be empty.", {
          tracked: false,
        })
      );
    }

    const featureFlags = await getFeatureFlags(auth);
    const enableSkillReferences = featureFlags.includes("nested_skills");
    const skillReferenceValidation = validateSkillReferences(auth, {
      enabled: enableSkillReferences,
      instructions,
      parentSkillModelId: skillResource.id,
    });
    if (skillReferenceValidation.isErr()) {
      return skillReferenceValidation;
    }

    const attachedKnowledge = await skillResource.getAttachedKnowledge(auth);
    await skillResource.updateSkill(auth, {
      name: skillResource.name,
      agentFacingDescription: skillResource.agentFacingDescription,
      userFacingDescription: skillResource.userFacingDescription,
      instructions,
      instructionsHtml: convertMarkdownToBlockHtml(instructions),
      icon: skillResource.icon,
      mcpServerViews: skillResource.mcpServerViews,
      attachedKnowledge,
      requestedSpaceIds: skillResource.requestedSpaceIds,
      enableSkillReferences,
    });

    await pruneOutdatedSkillEditSuggestions(auth, skillResource);

    return new Ok([
      {
        type: "text" as const,
        text: `Updated instructions for skill "${skillResource.name}" with ${occurrences} replacement${
          occurrences === 1 ? "" : "s"
        }.`,
      },
    ]);
  },

  upload_skill_files: async (
    { skillName, files, replaceExistingFiles },
    { auth, agentLoopContext }
  ) => {
    const skillResource = await SkillResource.fetchActiveByName(
      auth,
      skillName.trim()
    );
    if (!skillResource) {
      return new Err(
        new MCPError(`Skill "${skillName}" not found.`, { tracked: false })
      );
    }
    if (!skillResource.canWrite(auth)) {
      return new Err(
        new MCPError("Only editors can modify this skill.", {
          tracked: false,
        })
      );
    }

    const featureFlags = await getFeatureFlags(auth);
    if (!featureFlags.includes("sandbox_tools")) {
      return new Err(
        new MCPError("File attachments are not supported.", { tracked: false })
      );
    }

    const conversation = agentLoopContext?.runContext?.conversation;
    if (!conversation) {
      return new Err(
        new MCPError("No conversation context available.", { tracked: false })
      );
    }

    const dustFsResult = await DustFileSystem.forConversation(
      auth,
      conversation
    );
    if (dustFsResult.isErr()) {
      return new Err(
        new MCPError(dustFsResult.error.message, { tracked: false })
      );
    }

    const uploadedFilesRes = await uploadSkillFiles(auth, {
      dustFs: dustFsResult.value,
      files,
    });
    if (uploadedFilesRes.isErr()) {
      return uploadedFilesRes;
    }

    await skillResource.updateFileAttachments(
      auth,
      replaceExistingFiles
        ? uploadedFilesRes.value
        : [...skillResource.getFileAttachments(), ...uploadedFilesRes.value]
    );

    await pruneOutdatedSkillEditSuggestions(auth, skillResource);

    return new Ok([
      {
        type: "text" as const,
        text: `Uploaded ${uploadedFilesRes.value.length} file${pluralize(
          uploadedFilesRes.value.length
        )} to skill "${skillResource.name}".`,
      },
    ]);
  },
};

export const TOOLS = buildTools(SKILLS_TOOLS_METADATA, handlers);
