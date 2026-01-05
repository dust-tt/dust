import {
  validateTailwindCode,
  validateTypeScriptSyntax,
} from "@app/lib/api/files/content_validation";
import {
  getFileContent,
  getUpdatedContentAndOccurrences,
} from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { InteractiveContentFileContentType, Result } from "@app/types";
import {
  Err,
  INTERACTIVE_CONTENT_FILE_FORMATS,
  isInteractiveContentFileContentType,
  normalizeError,
  Ok,
} from "@app/types";

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
): Promise<Result<FileResource, { tracked: boolean; message: string }>> {
  // Validate Tailwind classes.
  const tailwindValidation = validateTailwindCode(content);
  if (tailwindValidation.isErr()) {
    return new Err({
      message: tailwindValidation.error.message,
      tracked: false,
    });
  }

  // Validate TypeScript/JSX syntax.
  const syntaxValidation = validateTypeScriptSyntax(content);
  if (syntaxValidation.isErr()) {
    return new Err({
      message: syntaxValidation.error.message,
      tracked: false,
    });
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
      hasPreviousVersion: false, // New file has no previous version.
      // Attach the conversation id so we can use it to control access to the file.
      useCase: "conversation",
      useCaseMetadata: {
        conversationId,
        lastEditedByAgentConfigurationId: createdByAgentConfigurationId,
      },
    });

    // Upload content directly.
    await fileResource.uploadContent(auth, content);

    return new Ok(fileResource);
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
    { fileResource: FileResource; replacementCount: number },
    { tracked: boolean; message: string }
  >
> {
  // Fetch the existing file.
  const fileContentResult = await getClientExecutableFileContent(auth, fileId);
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

  // Update metadata to track the editing agent and set hasPreviousVersion flag
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

  // Set hasPreviousVersion flag since we're creating a new version
  // Only update if it's not already true (covers both false and null cases)
  if (fileResource.hasPreviousVersion !== true) {
    await fileResource.setHasPreviousVersion(true);
  }

  // Validate the Tailwind classes in the resulting code.
  const tailwindValidation = validateTailwindCode(updatedContent);
  if (tailwindValidation.isErr()) {
    return new Err({
      message: tailwindValidation.error.message,
      tracked: false,
    });
  }

  // Validate TypeScript/JSX syntax in the resulting code.
  const syntaxValidation = validateTypeScriptSyntax(updatedContent);
  if (syntaxValidation.isErr()) {
    return new Err({
      message: syntaxValidation.error.message,
      tracked: false,
    });
  }

  // Upload the updated content.
  await fileResource.uploadContent(auth, updatedContent);

  return new Ok({ fileResource, replacementCount: occurrences });
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
    return new Err({ message: `File not found: ${fileId}`, tracked: true });
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

// Minimum number of versions required to perform a revert (current + previous).
const MIN_VERSIONS_FOR_REVERT = 2;

// Revert the changes made to the Interactive Content file in the last agent message.
// Uses GCS versioning to restore the previous version of the file.
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
  Result<
    { fileResource: FileResource; revertedContent: string },
    { tracked: boolean; message: string }
  >
> {
  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    return new Err({ tracked: true, message: "File not found" });
  }

  // Get all versions of the file (sorted newest to oldest)
  // No maxResults limit - we need all versions to ensure correct sorting
  let versions;
  try {
    versions = await fileResource.getSortedFileVersions(auth);
  } catch (error) {
    return new Err({
      tracked: true,
      message: `Failed to retrieve file versions: ${normalizeError(error)}`,
    });
  }

  // Check if there's a previous version available, button should be hidden in this
  // case but just in case
  if (versions.length < MIN_VERSIONS_FOR_REVERT) {
    return new Err({
      tracked: true,
      message: "No previous version available to revert to",
    });
  }

  // Log version generations for debugging
  logger.info(
    {
      fileId,
      versionGenerations: versions.map((v) => v.metadata.generation),
      versionCount: versions.length,
    },
    "File versions retrieved for revert"
  );

  const currentVersion = versions[0];
  const previousVersion = versions[1];

  // Download the previous version's content
  let revertedContent: string;
  try {
    const [content] = await previousVersion.download();
    revertedContent = content.toString("utf8");
  } catch (error) {
    return new Err({
      tracked: true,
      message: `Failed to download previous version: ${normalizeError(error)}`,
    });
  }

  // Update metadata BEFORE upload (following the pattern from editClientExecutableFile)
  await fileResource.setUseCaseMetadata({
    ...fileResource.useCaseMetadata,
    lastEditedByAgentConfigurationId: revertedByAgentConfigurationId,
  });

  // Update hasPreviousVersion flag based on remaining versions
  const stillHasPreviousVersion = versions.length > MIN_VERSIONS_FOR_REVERT;
  await fileResource.setHasPreviousVersion(stillHasPreviousVersion);

  // Upload the reverted content
  await fileResource.uploadContent(auth, revertedContent);

  // Delete old versions to prevent accumulation and infinite loops
  try {
    await currentVersion.delete();
    await previousVersion.delete();
  } catch (error) {
    // Log but don't fail the revert if deletion fails
    logger.error(
      {
        fileId,
        error,
      },
      "Failed to clean up old file versions after revert"
    );
  }

  return new Ok({ fileResource, revertedContent });
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
