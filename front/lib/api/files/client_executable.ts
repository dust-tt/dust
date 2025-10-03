import groupBy from "lodash/groupBy";

import {
  CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
  EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
  RENAME_CONTENT_CREATION_FILE_TOOL_NAME,
  REVERT_CONTENT_CREATION_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/content_creation/types";
import {
  getFileContent,
  getUpdatedContentAndOccurrences,
} from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type {
  ContentCreationFileContentType,
  ModelId,
  Result,
  WorkspaceType,
} from "@app/types";
import {
  clientExecutableContentType,
  CONTENT_CREATION_FILE_FORMATS,
  Err,
  isContentCreationContentType,
  normalizeError,
  Ok,
} from "@app/types";

// Regular expressions to capture the value inside a className attribute.
// We check both double and single quotes separately to handle mixed usage.
const classNameDoubleQuoteRegex = /className\s*=\s*"([^"]*)"/g;
const classNameSingleQuoteRegex = /className\s*=\s*'([^']*)'/g;

// Regular expression to capture Tailwind arbitrary values:
// Matches a word boundary, then one or more lowercase letters or hyphens,
// followed by a dash, an opening bracket, one or more non-']' characters, and a closing bracket.
const arbitraryRegex = /\b[a-z-]+-\[[^\]]+\]/g;

/**
 * Validates that the generated code doesn't contain Tailwind arbitrary values.
 *
 * Arbitrary values like h-[600px], w-[800px], bg-[#ff0000] cause visualization failures
 * because they're not included in our pre-built CSS. This validation fails fast with
 * a clear error message that gets exposed to the user, allowing them to retry which
 * provides the error details to the model for correction.
 */
function validateTailwindCode(code: string): Result<undefined, Error> {
  const matches: string[] = [];

  // Check double-quoted className attributes
  let classMatch: RegExpExecArray | null = null;
  while ((classMatch = classNameDoubleQuoteRegex.exec(code)) !== null) {
    const classContent = classMatch[1];
    if (classContent) {
      // Find all matching arbitrary values within the class attribute's value.
      const arbitraryMatches = classContent.match(arbitraryRegex) ?? [];
      matches.push(...arbitraryMatches);
    }
  }

  // Check single-quoted className attributes
  while ((classMatch = classNameSingleQuoteRegex.exec(code)) !== null) {
    const classContent = classMatch[1];
    if (classContent) {
      // Find all matching arbitrary values within the class attribute's value.
      const arbitraryMatches = classContent.match(arbitraryRegex) ?? [];
      matches.push(...arbitraryMatches);
    }
  }

  // If we found any, remove duplicates and throw an error with up to three examples.
  if (matches.length > 0) {
    const uniqueMatches = Array.from(new Set(matches));
    const examples = uniqueMatches.slice(0, 3).join(", ");
    return new Err(
      new Error(
        `Forbidden Tailwind arbitrary values detected: ${examples}. ` +
          `Arbitrary values like h-[600px], w-[800px], bg-[#ff0000] are not allowed. ` +
          `Use predefined classes like h-96, w-full, bg-red-500 instead, or use the style prop for specific values.`
      )
    );
  }
  return new Ok(undefined);
}

function validateFileTitle({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType: ContentCreationFileContentType;
}): Result<undefined, { tracked: boolean; message: string }> {
  // Validate that the file extension matches the MIME type.
  const fileFormat = CONTENT_CREATION_FILE_FORMATS[mimeType];
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
    mimeType: ContentCreationFileContentType;
    fileName: string;
    createdByAgentConfigurationId?: string;
  }
): Promise<Result<FileResource, { tracked: boolean; message: string }>> {
  const validationResult = validateTailwindCode(content);
  if (validationResult.isErr()) {
    return new Err({
      message: validationResult.error.message,
      tracked: false,
    });
  }

  try {
    const workspace = auth.getNonNullableWorkspace();

    // Validate that the MIME type is supported.
    if (!isContentCreationContentType(mimeType)) {
      const supportedTypes = Object.keys(CONTENT_CREATION_FILE_FORMATS).join(
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
      tracked: true,
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

  if (
    editedByAgentConfigurationId &&
    fileResource.useCaseMetadata?.lastEditedByAgentConfigurationId !==
      editedByAgentConfigurationId
  ) {
    await fileResource.setUseCaseMetadata({
      ...fileResource.useCaseMetadata,
      lastEditedByAgentConfigurationId: editedByAgentConfigurationId,
    });
  }

  // Validate the Tailwind classes in the resulting code.
  const validationResult = validateTailwindCode(updatedContent);
  if (validationResult.isErr()) {
    return new Err({
      message: validationResult.error.message,
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

  if (fileResource.contentType !== clientExecutableContentType) {
    return new Err({
      message: `File '${fileId}' is not a content creation file (content type: ${fileResource.contentType})`,
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
): Promise<Result<{ fileResource: FileResource; content: string }, Error>> {
  try {
    // Fetch the existing file.
    const fileResource = await FileResource.fetchById(auth, fileId);
    if (!fileResource) {
      return new Err(new Error(`File not found: ${fileId}`));
    }

    // Check if it's a content creation file.
    if (fileResource.contentType !== clientExecutableContentType) {
      return new Err(
        new Error(
          `File '${fileId}' is not a content creation file ` +
            `(content type: ${fileResource.contentType})`
        )
      );
    }

    // Get the file content.
    const content = await getFileContent(auth, fileResource, "original");
    if (!content) {
      return new Err(new Error(`Failed to read content from file '${fileId}'`));
    }

    return new Ok({ fileResource, content });
  } catch (error) {
    return new Err(
      new Error(
        `Failed to retrieve file content for '${fileId}': ${normalizeError(error)}`
      )
    );
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
      CREATE_CONTENT_CREATION_FILE_TOOL_NAME &&
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
      EDIT_CONTENT_CREATION_FILE_TOOL_NAME &&
    typeof action.augmentedInputs.old_string === "string" &&
    typeof action.augmentedInputs.new_string === "string"
  );
}

function isRevertFileActionType(
  action: AgentMCPActionModel
): action is AgentMCPActionModel {
  return (
    action.toolConfiguration.originalName ===
    REVERT_CONTENT_CREATION_FILE_TOOL_NAME
  );
}

function isRenameFileActionType(
  action: AgentMCPActionModel
): action is AgentMCPActionModel & {
  augmentedInputs: { new_file_name: string };
} {
  return (
    action.toolConfiguration.originalName ===
      RENAME_CONTENT_CREATION_FILE_TOOL_NAME &&
    typeof action.augmentedInputs.new_file_name === "string"
  );
}

function isCreateFileActionOutputType(
  output: AgentMCPActionOutputItem
): output is AgentMCPActionOutputItem & {
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
    const actionOutputs = await AgentMCPActionOutputItem.findAll({
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
    EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
    REVERT_CONTENT_CREATION_FILE_TOOL_NAME,
    RENAME_CONTENT_CREATION_FILE_TOOL_NAME,
  ].includes(action.toolConfiguration.originalName);
}

// A conversation can have multiple files so you need to find the file actions for the given fileId.
export async function getFileActionsByType(
  actions: AgentMCPActionModel[],
  fileId: string,
  workspace: WorkspaceType
) {
  let createFileAction: AgentMCPActionModel | null = null;
  const clientExecutableFileActions: AgentMCPActionModel[] = [];

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
      clientExecutableFileActions.push(action);
    }
  }

  return {
    createFileAction,
    clientExecutableFileActions,
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
 * - `clientExecutableFileActions` includes only past reverts; the current revert is not included.
 * - We expect that all changes on the file were done through the edit and rename tools.
 */
export function getEditAndRenameActionsToApply(
  clientExecutableFileActions: AgentMCPActionModel[]
) {
  const clientExecutableFileActionsByMessage = groupBy(
    clientExecutableFileActions,
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

  const pickedEditAndRenameActions = [];

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
        pickedEditAndRenameActions.push(currentAction);
        continue;
      }

      if (isRevertFileActionType(currentAction)) {
        cancelGroupActionCounter++;
      }
    }
  }

  return pickedEditAndRenameActions;
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

  for (const editAction of sortedActions) {
    if (!isEditFileActionType(editAction)) {
      // Skip non-edit actions (e.g., rename).
      continue;
    }

    const { old_string, new_string } = editAction.augmentedInputs;

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

// Revert the changes made to the Content Creation file in the last agent message.
// This reconstructs the previous file content and name by replaying edit and rename
// operations chronologically from the create action.
export async function revertClientExecutableFileChanges(
  auth: Authenticator,
  {
    fileId,
    conversationId,
    revertedByAgentConfigurationId,
  }: {
    fileId: string;
    conversationId: ModelId;
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
    return new Err({ message: `File not found: ${fileId}`, tracked: true });
  }

  if (fileResource.contentType !== clientExecutableContentType) {
    return new Err({
      message: `File '${fileId}' is not a content creation file (content type: ${fileResource.contentType})`,
      tracked: true,
    });
  }

  try {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch all the successful actions from the given conversation id
    // (we only update the file when action succeeded).
    const conversationActions = await AgentMCPActionModel.findAll({
      include: [
        {
          model: AgentMessage,
          as: "agentMessage",
          required: true,
          include: [
            {
              model: Message,
              as: "message",
              required: true,
              where: {
                conversationId,
                workspaceId: workspace.id,
              },
            },
          ],
        },
      ],
      where: {
        workspaceId: workspace.id,
        status: "succeeded",
      },
    });

    if (!conversationActions.length) {
      return new Err({
        message: `No file actions found for: ${fileId}`,
        tracked: true,
      });
    }

    const { createFileAction, clientExecutableFileActions } =
      await getFileActionsByType(conversationActions, fileId, workspace);

    if (createFileAction === null) {
      return new Err({
        message: `Cannot find the create file action for ${fileId}`,
        tracked: true,
      });
    }

    const editAndRenameActionsToApply = getEditAndRenameActionsToApply(
      clientExecutableFileActions
    );

    const revertedContent = getRevertedContent(
      createFileAction,
      editAndRenameActionsToApply
    );

    const revertedFileName = getRevertedFileName(
      createFileAction,
      editAndRenameActionsToApply
    );

    // Apply the reverted file name if it differs from the current name
    if (fileResource.fileName !== revertedFileName) {
      await fileResource.rename(revertedFileName);
    }

    await fileResource.setUseCaseMetadata({
      ...fileResource.useCaseMetadata,
      lastEditedByAgentConfigurationId: revertedByAgentConfigurationId,
    });

    await fileResource.uploadContent(auth, revertedContent);

    return new Ok({ fileResource, revertedContent });
  } catch (error) {
    return new Err({
      message: `Failed to revert ${fileId}: ${normalizeError(error)}`,
      tracked: true,
    });
  }
}
