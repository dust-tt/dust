import groupBy from "lodash/groupBy";

import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/types";
import {
  validateTailwindCode,
  validateTypeScriptSyntax,
} from "@app/lib/api/files/content_validation";
import {
  getFileContent,
  getUpdatedContentAndOccurrences,
} from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  InteractiveContentFileContentType,
  Result,
  WorkspaceType,
} from "@app/types";
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
        editedByAgentConfigurationId ||
      !fileResource.useCaseMetadata?.hasPreviousVersion;

    if (needsMetadataUpdate) {
      await fileResource.setUseCaseMetadata({
        ...fileResource.useCaseMetadata,
        lastEditedByAgentConfigurationId: editedByAgentConfigurationId,
        hasPreviousVersion: true, // Original version is now a previous version
      });
    }
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

export function isCreateFileActionType(
  action: AgentMCPActionModel
): action is AgentMCPActionModel & {
  augmentedInputs: {
    content: string;
    file_name: string;
  };
} {
  return (
    action.toolConfiguration.originalName ===
      CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME &&
    typeof action.augmentedInputs.content === "string" &&
    typeof action.augmentedInputs.file_name === "string"
  );
}

function isEditFileActionType(
  action: AgentMCPActionModel
): action is AgentMCPActionModel & {
  augmentedInputs: { old_string: string; new_string: string };
} {
  return (
    action.toolConfiguration.originalName ===
      EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME &&
    typeof action.augmentedInputs.old_string === "string" &&
    typeof action.augmentedInputs.new_string === "string"
  );
}

function isRevertFileActionType(
  action: AgentMCPActionModel
): action is AgentMCPActionModel {
  return (
    action.toolConfiguration.originalName ===
    REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME
  );
}

function isRenameFileActionType(
  action: AgentMCPActionModel
): action is AgentMCPActionModel & {
  augmentedInputs: { new_file_name: string };
} {
  return (
    action.toolConfiguration.originalName ===
      RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME &&
    typeof action.augmentedInputs.new_file_name === "string"
  );
}

function isCreateFileActionOutputType(
  output: AgentMCPActionOutputItemModel
): output is AgentMCPActionOutputItemModel & {
  content: { resource: { fileId: string } };
} {
  if (typeof output.content !== "object" || output.content === null) {
    return false;
  }

  if (
    typeof output.content.resource !== "object" ||
    output.content.resource === null
  ) {
    return false;
  }

  return (
    "fileId" in output.content.resource &&
    typeof output.content.resource.fileId === "string"
  );
}

export async function isCreateFileActionForFileId({
  action,
  workspace,
  fileId,
}: {
  action: AgentMCPActionModel;
  workspace: WorkspaceType;
  fileId: string;
}) {
  if (isCreateFileActionType(action)) {
    const actionOutputs = await AgentMCPActionOutputItemModel.findAll({
      where: {
        agentMCPActionId: action.id,
        workspaceId: workspace.id,
      },
    });

    const createdActionOutputs = actionOutputs.filter((output) => {
      if (isCreateFileActionOutputType(output)) {
        return output.content.resource.fileId === fileId;
      }

      return false;
    });

    // No outputs referencing `fileId` => this action did not create that file.
    if (createdActionOutputs.length === 0) {
      return false;
    }

    // Multiple outputs referencing the same `fileId` should never occur.
    if (createdActionOutputs.length > 1) {
      throw new Error(
        `Multiple create file actions found for file_id ${fileId}.`
      );
    }

    return true;
  }

  return false;
}

function isEditOrRevertOrRenameFileAction(
  action: AgentMCPActionModel,
  fileId: string
) {
  if (action.augmentedInputs.file_id !== fileId) {
    return false;
  }

  return [
    EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  ].includes(action.toolConfiguration.originalName);
}

// A conversation can have multiple files so you need to find the file actions for the given fileId.
export async function getFileActionsByType(
  actions: AgentMCPActionModel[],
  fileId: string,
  workspace: WorkspaceType
) {
  let createFileAction: AgentMCPActionModel | null = null;
  const nonCreateFileActions: AgentMCPActionModel[] = [];

  for (const action of actions) {
    const isCreateAction = await isCreateFileActionForFileId({
      action,
      workspace,
      fileId,
    });

    if (isCreateAction) {
      createFileAction = action;
    }

    if (isEditOrRevertOrRenameFileAction(action, fileId)) {
      nonCreateFileActions.push(action);
    }
  }

  return {
    createFileAction,
    nonCreateFileActions,
  };
}

/**
 * Returns the edit and rename actions that still apply after a revert operation.
 *
 * How it works:
 * - Group by agentMessageId (a "group" = one agent message). Sort within a group oldest => newest.
 * - Process groups newest => oldest so the revert cancels the most recent changes first.
 * - Maintain a cancellation counter starting at 1 (single revert step).
 *   While counter > 0:
 *     • Edit/rename-only group => skip it and decrement counter by 1.
 *     • Group with any revert(s) => do not decrement; increase counter by 1 per revert. Drop edits/renames in that group.
 * - When counter = 0, collect edit and rename actions in order; if a revert is encountered, increase the counter and resume cancellation for older groups.
 *
 * Note:
 * - `nonCreateFileActions` includes only past reverts; the current revert is not included.
 * - We expect that all changes on the file were done through the edit and rename tools.
 */
export function getEditAndRenameActionsToApply(
  nonCreateFileActions: AgentMCPActionModel[]
) {
  const clientExecutableFileActionsByMessage = groupBy(
    nonCreateFileActions,
    (action) => action.agentMessageId
  );

  // Within each group, sort actions chronologically (oldest → newest).
  Object.keys(clientExecutableFileActionsByMessage).forEach((messageId) => {
    clientExecutableFileActionsByMessage[messageId] =
      clientExecutableFileActionsByMessage[messageId].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
  });

  // Order groups newest => oldest (based on the group's earliest action time).
  const sortedActionGroups = Object.values(
    clientExecutableFileActionsByMessage
  ).sort(
    (actionsA, actionsB) =>
      actionsB[0].createdAt.getTime() - actionsA[0].createdAt.getTime()
  );

  // Remaining edit/rename-only groups to cancel. Starts from the current revert.
  let cancelGroupActionCounter = 1;

  const editAndRenameActionsToApply = [];

  for (const actionGroup of sortedActionGroups) {
    if (cancelGroupActionCounter > 0) {
      const revertActions = actionGroup.filter((a) =>
        isRevertFileActionType(a)
      );

      // Cancel everything if there are only edit/rename actions in the group.
      if (revertActions.length === 0) {
        cancelGroupActionCounter--;
        continue;
      }

      // Extend cancellation window by each revert (any edits/renames in the group will be cancelled).
      cancelGroupActionCounter += revertActions.length;

      continue;
    }

    // Not cancelling: collect edits and renames. A revert here reopens cancellation for older groups.
    for (const currentAction of actionGroup) {
      if (
        isEditFileActionType(currentAction) ||
        isRenameFileActionType(currentAction)
      ) {
        editAndRenameActionsToApply.push(currentAction);
        continue;
      }

      if (isRevertFileActionType(currentAction)) {
        cancelGroupActionCounter++;
      }
    }
  }

  return editAndRenameActionsToApply;
}

export function getRevertedContent(
  createFileAction: AgentMCPActionModel,
  actionsToApply: AgentMCPActionModel[]
) {
  // Sort actions from oldest to latest since we need to apply the changes from top to bottom.
  const sortedActions = actionsToApply.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  if (!isCreateFileActionType(createFileAction)) {
    throw new Error("Wrong file action type for create file action");
  }

  let revertedContent = createFileAction.augmentedInputs.content;

  for (const action of sortedActions) {
    if (!isEditFileActionType(action)) {
      // Skip non-edit actions (e.g., rename).
      continue;
    }

    const { old_string, new_string } = action.augmentedInputs;

    const { updatedContent, occurrences } = getUpdatedContentAndOccurrences({
      oldString: old_string,
      newString: new_string,
      currentContent: revertedContent,
    });

    if (occurrences === 0) {
      throw new Error(`Cannot find matched text: "${old_string}"`);
    }

    revertedContent = updatedContent;
  }

  return revertedContent;
}

export function getRevertedFileName(
  createFileAction: AgentMCPActionModel,
  actionsToApply: AgentMCPActionModel[]
) {
  // Loop backwards to find the most recent rename.
  for (let i = actionsToApply.length - 1; i >= 0; i--) {
    const action = actionsToApply[i];
    if (isRenameFileActionType(action)) {
      return action.augmentedInputs.new_file_name;
    }
  }

  if (!isCreateFileActionType(createFileAction)) {
    throw new Error("Wrong file action type for create file action");
  }

  // No rename were found, the file kept its original name.
  return createFileAction.augmentedInputs.file_name;
}

// Number of file versions to fetch when checking for revert capability.
// We fetch 3 to determine: current (0), previous (1), and if there's another older version (2).
const FILE_VERSIONS_TO_FETCH_FOR_REVERT = 3;

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
    return new Err({ tracked: false, message: "File not found" });
  }

  // Get the GCS path for this file
  const filePath = fileResource.getCloudStoragePath(auth, "original");
  const fileStorage = getPrivateUploadBucket();

  // Get all versions of the file (sorted newest to oldest)
  let versions;
  try {
    versions = await fileStorage.getFileVersions({
      filePath,
      maxResults: FILE_VERSIONS_TO_FETCH_FOR_REVERT,
    });
  } catch (error) {
    return new Err({
      tracked: false,
      message: `Failed to retrieve file versions: ${normalizeError(error)}`,
    });
  }

  // Check if there's a previous version available, button should be hidden in this
  // case but just in case
  if (versions.length < MIN_VERSIONS_FOR_REVERT) {
    return new Err({
      tracked: false,
      message: "No previous version available to revert to",
    });
  }

  const currentVersion = versions[0];
  const previousVersion = versions[1];

  // Download the previous version's content
  let revertedContent: string;
  try {
    const [content] = await previousVersion.download();
    revertedContent = content.toString("utf8");
  } catch (error) {
    return new Err({
      tracked: false,
      message: `Failed to download previous version: ${normalizeError(error)}`,
    });
  }

  // Update metadata BEFORE upload (following the pattern from editClientExecutableFile)
  const stillHasPreviousVersion = versions.length > MIN_VERSIONS_FOR_REVERT;
  await fileResource.setUseCaseMetadata({
    ...fileResource.useCaseMetadata,
    lastEditedByAgentConfigurationId: revertedByAgentConfigurationId,
    hasPreviousVersion: stillHasPreviousVersion,
  });

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
