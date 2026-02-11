import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import {
  validateTailwindCode,
  validateTypeScriptSyntax,
} from "@app/lib/api/files/content_validation";
import {
  getFileContent,
  getUpdatedContentAndOccurrences,
} from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { InteractiveContentFileContentType } from "@app/types/files";
import {
  INTERACTIVE_CONTENT_FILE_FORMATS,
  isInteractiveContentFileContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function validateFileTitle({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType: InteractiveContentFileContentType;
}): Result<undefined, { tracked: boolean; message: string }> {
  // Validate that the file extension matches the MIME type.
  const fileFormat = INTERACTIVE_CONTENT_FILE_FORMATS[mimeType];
  const fileNameParts = fileName.split(".");
  if (fileNameParts.length < 2) {
    const supportedExts = fileFormat.exts.join(", ");
    return new Err({
      message:
        `File name must include a valid extension. Supported extensions for ` +
        `${mimeType}: ${supportedExts}.`,
      tracked: false,
    });
  }

  const extension = `.${fileNameParts[fileNameParts.length - 1].toLowerCase()}`;
  if (!(fileFormat.exts as string[]).includes(extension)) {
    const supportedExts = fileFormat.exts.join(", ");
    return new Err({
      message:
        `File extension ${extension} is not supported for MIME type ${mimeType}. ` +
        `Supported extensions: ${supportedExts}.`,
      tracked: false,
    });
  }
  return new Ok(undefined);
}

export async function createClientExecutableFile(
  auth: Authenticator,
  {
    content,
    conversationId,
    fileName,
    mimeType,
    createdByAgentConfigurationId,
  }: {
    content: string;
    conversationId: string;
    mimeType: InteractiveContentFileContentType;
    fileName: string;
    createdByAgentConfigurationId?: string;
  }
): Promise<
  Result<
    { fileResource: FileResource; warnings: ValidationWarning[] },
    { tracked: boolean; message: string }
  >
> {
  // TODO(2026-01-16 flav): Implement warning logic.
  // Validate TypeScript/JSX syntax (blocking). File creation fails if invalid.
  const syntaxValidation = validateTypeScriptSyntax(content);
  if (syntaxValidation.isErr()) {
    return new Err({
      message: syntaxValidation.error.message,
      tracked: false,
    });
  }

  // Collect Tailwind validation warnings (non-blocking).
  const warnings: ValidationWarning[] = [];
  const tailwindValidation = validateTailwindCode(content);
  if (tailwindValidation.isErr()) {
    warnings.push(...tailwindValidation.error);
  }

  try {
    const workspace = auth.getNonNullableWorkspace();

    // Validate that the MIME type is supported.
    if (!isInteractiveContentFileContentType(mimeType)) {
      const supportedTypes = Object.keys(INTERACTIVE_CONTENT_FILE_FORMATS).join(
        ", "
      );

      return new Err({
        message: `Unsupported MIME type: ${mimeType}. Supported types: ${supportedTypes}`,
        tracked: false,
      });
    }

    const fileNameValidationResult = validateFileTitle({ fileName, mimeType });
    if (fileNameValidationResult.isErr()) {
      return fileNameValidationResult;
    }

    // Create the file resource.
    const fileResource = await FileResource.makeNew({
      workspaceId: workspace.id,
      fileName,
      contentType: mimeType,
      fileSize: 0, // Will be updated in uploadContent.
      // Attach the conversation id so we can use it to control access to the file.
      useCase: "conversation",
      useCaseMetadata: {
        conversationId,
        lastEditedByAgentConfigurationId: createdByAgentConfigurationId,
      },
    });

    // Upload content directly.
    await fileResource.uploadContent(auth, content);

    return new Ok({ fileResource, warnings });
  } catch (error) {
    const workspace = auth.getNonNullableWorkspace();
    logger.error(
      {
        fileName,
        conversationId,
        workspaceId: workspace.id,
        error,
      },
      "Failed to create client executable file"
    );

    return new Err({
      message: `Failed to create client executable file '${fileName}': ${normalizeError(error)}`,
      tracked: true,
    });
  }
}

export async function editClientExecutableFile(
  auth: Authenticator,
  {
    fileId,
    oldString,
    newString,
    expectedReplacements = 1,
    editedByAgentConfigurationId,
  }: {
    fileId: string;
    oldString: string;
    newString: string;
    expectedReplacements?: number;
    editedByAgentConfigurationId?: string;
  }
): Promise<
  Result<
    {
      fileResource: FileResource;
      replacementCount: number;
      warnings: ValidationWarning[];
    },
    { tracked: boolean; message: string }
  >
> {
  // Acquire edit lock to prevent concurrent modifications.
  // TODO(YJS): Replace with YJS-based concurrent editing for proper multi-agent support.
  try {
    return await executeWithLock(`file:edit:${fileId}`, async () => {
      // Fetch the existing file.
      const fileContentResult = await getClientExecutableFileContent(
        auth,
        fileId
      );
      if (fileContentResult.isErr()) {
        return new Err({
          message: fileContentResult.error.message,
          tracked: fileContentResult.error.tracked,
        });
      }
      const { fileResource, content: currentContent } = fileContentResult.value;

      const { updatedContent, occurrences } = getUpdatedContentAndOccurrences({
        oldString,
        newString,
        currentContent,
      });

      if (occurrences === 0) {
        return new Err({
          message: `String not found in file: "${oldString}"`,
          tracked: false,
        });
      }

      if (occurrences !== expectedReplacements) {
        return new Err({
          message: `Expected ${expectedReplacements} replacements, but found ${occurrences} occurrences`,
          tracked: false,
        });
      }

      // Update metadata to track the editing agent
      if (editedByAgentConfigurationId) {
        const needsMetadataUpdate =
          fileResource.useCaseMetadata?.lastEditedByAgentConfigurationId !==
          editedByAgentConfigurationId;

        if (needsMetadataUpdate) {
          await fileResource.setUseCaseMetadata({
            ...fileResource.useCaseMetadata,
            lastEditedByAgentConfigurationId: editedByAgentConfigurationId,
          });
        }
      }

      // TODO(2026-01-16 flav): Implement warning logic.
      // Validate TypeScript/JSX syntax (blocking). File creation fails if invalid.
      const syntaxValidation = validateTypeScriptSyntax(updatedContent);
      if (syntaxValidation.isErr()) {
        return new Err({
          message: syntaxValidation.error.message,
          tracked: false,
        });
      }

      // Collect Tailwind validation warnings (non-blocking).
      const warnings: ValidationWarning[] = [];
      const tailwindValidation = validateTailwindCode(updatedContent);
      if (tailwindValidation.isErr()) {
        warnings.push(...tailwindValidation.error);
      }

      // Upload the updated content (version is incremented inside uploadContent).
      await fileResource.uploadContent(auth, updatedContent);

      return new Ok({ fileResource, replacementCount: occurrences, warnings });
    });
  } catch (error) {
    return new Err({
      message: `File is currently being edited: ${normalizeError(error)}`,
      tracked: false,
    });
  }
}

export async function renameClientExecutableFile(
  auth: Authenticator,
  {
    fileId,
    newFileName,
    renamedByAgentConfigurationId,
  }: {
    fileId: string;
    newFileName: string;
    renamedByAgentConfigurationId?: string;
  }
): Promise<Result<FileResource, { tracked: boolean; message: string }>> {
  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    return new Err({ message: `File not found: ${fileId}`, tracked: false });
  }

  if (!isInteractiveContentFileContentType(fileResource.contentType)) {
    return new Err({
      message: `File '${fileId}' is not an interactive content file (content type: ${fileResource.contentType})`,
      tracked: false,
    });
  }

  const fileNameValidationResult = validateFileTitle({
    fileName: newFileName,
    mimeType: fileResource.contentType,
  });
  if (fileNameValidationResult.isErr()) {
    return fileNameValidationResult;
  }

  await fileResource.rename(newFileName);

  if (
    renamedByAgentConfigurationId &&
    fileResource.useCaseMetadata?.lastEditedByAgentConfigurationId !==
      renamedByAgentConfigurationId
  ) {
    await fileResource.setUseCaseMetadata({
      ...fileResource.useCaseMetadata,
      lastEditedByAgentConfigurationId: renamedByAgentConfigurationId,
    });
  }

  return new Ok(fileResource);
}

export async function getClientExecutableFileContent(
  auth: Authenticator,
  fileId: string
): Promise<
  Result<
    { fileResource: FileResource; content: string },
    {
      message: string;
      tracked: boolean;
    }
  >
> {
  try {
    // Sometimes the model makes up a random file id that doesn't exist,
    // so we check if this is actually a valid id or not.
    const resourceId = getResourceIdFromSId(fileId);

    if (resourceId === null) {
      return new Err({
        message: `The id ${fileId} is not a valid file id`,
        tracked: false,
      });
    }

    const fileResource = await FileResource.fetchById(auth, fileId);
    if (!fileResource) {
      return new Err({
        message: `File not found: ${fileId}`,
        tracked: false,
      });
    }

    // Check if it's an Interactive Content file.
    if (!isInteractiveContentFileContentType(fileResource.contentType)) {
      return new Err({
        message:
          `File '${fileId}' is not an Interactive Content file ` +
          `(content type: ${fileResource.contentType})`,
        tracked: false,
      });
    }

    // Get the file content.
    const content = await getFileContent(auth, fileResource, "original");
    if (!content) {
      return new Err({
        message: `Failed to read content from file '${fileId}'`,
        tracked: true,
      });
    }

    return new Ok({ fileResource, content });
  } catch (error) {
    return new Err({
      message: `Failed to retrieve file content for '${fileId}': ${normalizeError(error)}`,
      tracked: true,
    });
  }
}

// Revert the changes made to the Interactive Content file in the last agent message.
// Uses FileResource revert function
export async function revertClientExecutableFileChanges(
  auth: Authenticator,
  {
    fileId,
    revertedByAgentConfigurationId,
  }: {
    fileId: string;
    revertedByAgentConfigurationId: string;
  }
): Promise<
  Result<{ fileResource: FileResource }, { tracked: boolean; message: string }>
> {
  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    return new Err({ tracked: true, message: "File not found" });
  }

  const revertResult = await fileResource.revert(auth, {
    revertedByAgentConfigurationId,
  });

  if (revertResult.isErr()) {
    return new Err({
      tracked: false,
      message: revertResult.error,
    });
  }

  return new Ok({ fileResource });
}

export async function getClientExecutableFileShareUrl(
  auth: Authenticator,
  fileId: string
): Promise<Result<string, Error>> {
  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    return new Err(new Error(`File not found: ${fileId}`));
  }

  if (!fileResource.isInteractiveContent) {
    return new Err(
      new Error(
        `File '${fileId}' is not an Interactive Content file and cannot be shared.`
      )
    );
  }

  const shareInfo = await fileResource.getShareInfo();
  if (!shareInfo) {
    return new Err(new Error(`File '${fileId}' isn't shared.`));
  }

  return new Ok(shareInfo.shareUrl);
}
