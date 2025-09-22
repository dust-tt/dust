import groupBy from "lodash/groupBy";

import {
  CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
  EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
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
} from "@app/types";
import {
  clientExecutableContentType,
  CONTENT_CREATION_FILE_FORMATS,
  Err,
  isContentCreationContentType,
  normalizeError,
  Ok,
} from "@app/types";

// Regular expression to capture the value inside a className attribute. This pattern assumes
// double quotes for simplicity.
const classNameRegex = /className\s*=\s*"([^"]*)"/g;

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
  let classMatch: RegExpExecArray | null = null;

  // Iterate through all occurrences of the className attribute in the code.
  while ((classMatch = classNameRegex.exec(code)) !== null) {
    const classContent = classMatch[1];
    if (classContent) {
      // Find all matching arbitrary values within the class attribute's value.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const arbitraryMatches = classContent.match(arbitraryRegex) || [];
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

  const { updatedContent, occurrences } = getUpdatedContentAndOccurrences(
    oldString,
    newString,
    currentContent
  );

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

function isCreateFileActionOutput(
  output: AgentMCPActionOutputItem
): output is AgentMCPActionOutputItem & {
  content: { resource: { fileId: string } };
} {
  return (
    typeof output.content === "object" &&
    output.content !== null &&
    typeof (output.content as any).resource === "object" &&
    (output.content as any).resource !== null &&
    typeof (output.content as any).resource.fileId === "string"
  );
}

export async function isCreateFileAction(
  action: AgentMCPActionModel,
  workspaceId: number,
  fileId: string
) {
  if (isCreateFileActionType(action)) {
    // For create actions, `file_id` isn't present in inputs; inspect outputs to see
    // whether this action produced the specified `fileId` for this workspace.
    const createdActionOutputs = await getCreateFileActionOutputs(
      action,
      workspaceId,
      fileId
    );

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

export async function getCreateFileActionOutputs(
  action: AgentMCPActionModel,
  workspaceId: number,
  fileId: string
): Promise<AgentMCPActionOutputItem[]> {
  const actionOutputs = await AgentMCPActionOutputItem.findAll({
    where: {
      agentMCPActionId: action.id,
      workspaceId,
    },
    order: [["createdAt", "ASC"]],
  });

  const createdActionOutputs = actionOutputs.filter((output) => {
    if (isCreateFileActionOutput(output)) {
      return output.content.resource.fileId === fileId;
    }

    return false;
  });

  return createdActionOutputs;
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

export function isEditOrRevertFileAction(
  action: AgentMCPActionModel,
  fileId: string
) {
  if (action.augmentedInputs.file_id !== fileId) {
    return false;
  }

  return [
    EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
    REVERT_CONTENT_CREATION_FILE_TOOL_NAME,
  ].includes(action.toolConfiguration.originalName);
}

export function isCreateFileActionType(
  action: AgentMCPActionModel
): action is AgentMCPActionModel & {
  augmentedInputs: {
    content: string;
  };
} {
  return (
    action.toolConfiguration.originalName ===
      CREATE_CONTENT_CREATION_FILE_TOOL_NAME &&
    typeof action.augmentedInputs.content === "string"
  );
}

export function isRevertFileActionType(
  action: AgentMCPActionModel
): action is AgentMCPActionModel & {
  augmentedInputs: { revertCount?: number };
} {
  return (
    action.toolConfiguration.originalName ===
      REVERT_CONTENT_CREATION_FILE_TOOL_NAME &&
    typeof action.augmentedInputs === "object"
  );
}

// A conversation can have multiple files so you need to find the file actions.
export async function getFileActionsByActionType(
  actions: AgentMCPActionModel[],
  fileId: string,
  workspaceId: number
) {
  let createFileAction: AgentMCPActionModel | undefined;
  const editOrRevertFileActions: AgentMCPActionModel[] = [];

  for (const action of actions) {
    if (await isCreateFileAction(action, workspaceId, fileId)) {
      createFileAction = action;
    }

    if (isEditOrRevertFileAction(action, fileId)) {
      editOrRevertFileActions.push(action);
    }
  }

  return {
    createFileAction,
    editOrRevertFileActions,
  };
}

/**
 * Returns the edit actions that still apply after revert actions.
 *
 * How it works:
 * - Group by agentMessageId (a "group" = one agent message). Sort within a group oldest → newest.
 * - Process groups newest → oldest so reverts cancel the most recent edits first.
 * - Maintain a group-level cancellation counter seeded with `revertCount` from the current (external) revert.
 *   While counter > 0:
 *     • Edit-only group → skip it and decrement counter by 1.
 *     • Group with any revert(s) → do not decrement; add each revert's revertCount (default 1). Drop edits in that group.
 * - When counter = 0, collect edit actions in order; if a revert is encountered, increase the counter and resume cancellation for older groups.
 *
 * Notes:
 * - `editOrRevertActions` already includes past reverts; the current revert is not included (its value is `revertCount`).
 * - Returned edits are ordered by group (newest → oldest) and within group (oldest → newest).
 */
export function getEditActionsToApply(
  editOrRevertActions: AgentMCPActionModel[],
  revertCount: number
) {
  // Group actions by agent message ID (one group per message)
  const editOrRevertActionsByMessage = groupBy(
    editOrRevertActions,
    (action) => action.agentMessageId
  );

  // Within each group, sort actions chronologically (oldest → newest)
  Object.keys(editOrRevertActionsByMessage).forEach((messageId) => {
    editOrRevertActionsByMessage[messageId] = editOrRevertActionsByMessage[
      messageId
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  });

  // Order groups newest → oldest (based on the group's earliest action time)
  const sortedActionGroups = Object.entries(editOrRevertActionsByMessage)
    .sort(
      ([, actionsA], [, actionsB]) =>
        actionsB[0].createdAt.getTime() - actionsA[0].createdAt.getTime()
    )
    .map(([, actions]) => actions);

  // Remaining edit-only groups to cancel; starts from the current (external) revert
  let cancelGroupActionCounter = revertCount;

  const pickedEditActions = [];

  // Traverse groups newest → oldest
  for (const actionGroup of sortedActionGroups) {
    if (cancelGroupActionCounter > 0) {
      // If any revert is present, extend the window; otherwise consume one edit-only group
      const revertActions = actionGroup.filter((a) =>
        isRevertFileActionType(a)
      );

      if (revertActions.length === 0) {
        cancelGroupActionCounter--; // skip this edit-only group
        continue;
      }

      // Extend cancellation window by each revert's count. Drop edits in this group.
      for (const revertAction of revertActions) {
        const counter = revertAction.augmentedInputs.revertCount;
        cancelGroupActionCounter += typeof counter === "number" ? counter : 1;
      }
      continue;
    }

    // Not cancelling: collect edits. A revert here reopens cancellation for older groups
    for (const currentAction of actionGroup) {
      if (isEditFileActionType(currentAction)) {
        pickedEditActions.push(currentAction);
      } else if (isRevertFileActionType(currentAction)) {
        const counter = currentAction.augmentedInputs.revertCount;
        cancelGroupActionCounter += typeof counter === "number" ? counter : 1;
      }
    }
  }

  return pickedEditActions;
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

  for (let i = 0; i < sortedActions.length; i++) {
    const editAction = sortedActions[i];

    if (!isEditFileActionType(editAction)) {
      throw new Error("Wrong file action type for edit file action");
    }

    const { old_string, new_string } = editAction.augmentedInputs;

    const { updatedContent, occurrences } = getUpdatedContentAndOccurrences(
      old_string,
      new_string,
      revertedContent
    );

    if (occurrences === 0) {
      throw new Error(`Cannot find matched text: "${old_string}"`);
    }

    revertedContent = updatedContent;
  }

  return revertedContent;
}

// Revert the changes made to the Content Creation file in the last agent message.
// This reconstructs the previous file state by replaying edit operations chronologically
// from the create action.
export async function revertClientExecutableFileChanges(
  auth: Authenticator,
  {
    fileId,
    conversationId,
    revertedByAgentConfigurationId,
    revertCount = 1,
  }: {
    fileId: string;
    conversationId: ModelId;
    revertedByAgentConfigurationId: string;
    revertCount?: number;
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
    const workspaceId = auth.getNonNullableWorkspace().id;

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
                workspaceId,
              },
            },
          ],
        },
      ],
      where: {
        workspaceId,
        status: "succeeded",
      },
      order: [["createdAt", "ASC"]],
    });

    if (!conversationActions.length) {
      return new Err({
        message: `No file actions found for: ${fileId}`,
        tracked: true,
      });
    }

    const { createFileAction, editOrRevertFileActions } =
      await getFileActionsByActionType(
        conversationActions,
        fileId,
        workspaceId
      );

    if (createFileAction === undefined) {
      return new Err({
        message: `Cannot find the create file action for ${fileId}`,
        tracked: true,
      });
    }

    const editActionsToApply = getEditActionsToApply(
      editOrRevertFileActions,
      revertCount
    );

    const revertedContent = getRevertedContent(
      createFileAction,
      editActionsToApply
    );

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
