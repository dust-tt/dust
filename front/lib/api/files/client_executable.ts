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
    fileName: string;
    mimeType: ContentCreationFileContentType;
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

function isEditFileAction(
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

function isRevertFileAction(action: AgentMCPActionModel) {
  return (
    action.toolConfiguration.originalName ===
    REVERT_CONTENT_CREATION_FILE_TOOL_NAME
  );
}

function getEditOrRevertFileActions(
  actions: AgentMCPActionModel[],
  fileId: string
) {
  return actions.filter((action) => {
    if (action.augmentedInputs.file_id !== fileId) {
      return false;
    }

    return [
      EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
      REVERT_CONTENT_CREATION_FILE_TOOL_NAME,
    ].includes(action.toolConfiguration.originalName);
  });
}

async function getActionOutput(
  action: AgentMCPActionModel,
  workspaceId: number
) {
  return AgentMCPActionOutputItem.findAll({
    where: {
      agentMCPActionId: action.id,
      workspaceId,
    },
    order: [["createdAt", "ASC"]],
  });
}

export async function getCreateFileAction(
  actions: AgentMCPActionModel[],
  workspaceId: number,
  fileId: string
): Promise<AgentMCPActionModel | undefined> {
  // You can generate multiple files in one conversation
  const createActions = actions.filter(
    (action) =>
      action.toolConfiguration.originalName ===
      CREATE_CONTENT_CREATION_FILE_TOOL_NAME
  );

  for (const action of createActions) {
    // We need to check the outputs to find the create action for the given file id.
    const actionOutputs = await getActionOutput(action, workspaceId);

    const createdActionOutputs = actionOutputs.filter((output) => {
      if (isCreateFileActionOutput(output)) {
        return output.content.resource.fileId === fileId;
      }
      return false;
    });

    if (createdActionOutputs.length === 0) {
      continue;
    }

    if (createdActionOutputs.length > 1) {
      // This should never happen
      throw new Error(
        `Multiple create file actions found for file_id ${fileId}.`
      );
    }

    return action;
  }
}

/**
 * Determines which edit actions should be applied after accounting for revert operations.
 * 
 * The function processes a series of edit and revert actions, applying revert logic
 * that cancels previous action groups in reverse chronological order.
 * 
 * @returns Array of edit actions that should be applied after all reverts are processed
 */
export function getEditActionsToApply(
  editOrRevertActions: AgentMCPActionModel[],
  revertCount: number
) {
  // Group actions by agent message ID since multiple actions can occur in one message
  const editOrRevertActionsByMessage = groupBy(
    editOrRevertActions,
    (action) => action.agentMessageId
  );

  // Sort actions within each message group chronologically (oldest to newest)
  // This ensures we process actions in the order they were created within each message
  Object.keys(editOrRevertActionsByMessage).forEach((messageId) => {
    editOrRevertActionsByMessage[messageId] = editOrRevertActionsByMessage[
      messageId
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  });

  // Sort message groups by creation time (newest first)
  // We process from latest to oldest messages so reverts cancel the most recent actions first
  const sortedActionGroups = Object.entries(editOrRevertActionsByMessage)
    .sort(
      ([, actionsA], [, actionsB]) =>
        actionsB[0].createdAt.getTime() - actionsA[0].createdAt.getTime()
    )
    .map(([, actions]) => actions);

  // Track how many action groups we need to cancel
  // The current revert action (not included in editOrRevertActions) starts the cancellation
  let cancelGroupActionCounter = revertCount;
  const pickedEditActions = [];

  // Process each action group from newest to oldest
  for (
    const actionGroup of sortedActionGroups
  ) {

    // If we still have groups to cancel, check if this group should be skipped
    if (cancelGroupActionCounter > 0) {
      const revertActions = actionGroup.filter(action => isRevertFileAction(action));

      // If this group contains only edit actions (no reverts), cancel the entire group
      if (revertActions.length === 0) {
        cancelGroupActionCounter--;
        continue;
      } 

      // if it has both revert + edits, and this is the point we need to revert, we will skip the entire action
      if (cancelGroupActionCounter === 1 && revertActions.length !== actionGroup.length) {
        cancelGroupActionCounter--;
        continue;
      }
      // If this group contains revert actions, those reverts add to our cancellation count
      // (reverts in the past increase the number of groups we need to cancel)
      for (const revertAction of revertActions) {
        const counter = revertAction.augmentedInputs.revertCount;
        cancelGroupActionCounter += typeof counter === "number" ? counter : 1;
      }
      continue;
    }

    // We're no longer canceling groups, so process each action in this group
    for (let actionIndex = 0; actionIndex < actionGroup.length; actionIndex++) {
      const currentAction = actionGroup[actionIndex];

      // Collect edit actions that should be applied
      if (isEditFileAction(currentAction)) {
        pickedEditActions.push(currentAction);
        continue;
      }

      // Handle revert actions by adding to the cancellation counter
      // This affects processing of subsequent (older) action groups
      if (isRevertFileAction(currentAction)) {
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

  let revertedContent = createFileAction.augmentedInputs.content as string;

  for (let i = 0; i < sortedActions.length; i++) {
    const editAction = sortedActions[i];

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

async function getConversationActions(
  auth: Authenticator,
  conversationId: ModelId
): Promise<AgentMCPActionModel[]> {
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

  return conversationActions;
}

/**
 * Reverts the content creation file to the previous state.
 *
 * This reconstructs the previous file state by replaying edit operations chronologically
 * from the create action.
 */
export async function revertClientExecutableFileToPreviousState(
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

  const workspaceId = auth.getNonNullableWorkspace().id;

  const conversationActions = await getConversationActions(
    auth,
    conversationId
  );

  const editOrRevertFileActions = getEditOrRevertFileActions(
    conversationActions,
    fileId
  );

  const createFileAction = await getCreateFileAction(
    conversationActions,
    workspaceId,
    fileId
  );

  if (!createFileAction) {
    return new Err({
      message: `Cannot find the create file action for ${fileId}`,
      tracked: true,
    });
  }

  let editActionsToApply = [];

  try {
    editActionsToApply = getEditActionsToApply(
      editOrRevertFileActions,
      revertCount
    );
  } catch (error) {
    return new Err({
      message: `Failed to edit ${fileId}`,
      tracked: true,
    });
  }

  const revertedContent = getRevertedContent(createFileAction, editActionsToApply);

  await fileResource.setUseCaseMetadata({
    ...fileResource.useCaseMetadata,
    lastEditedByAgentConfigurationId: revertedByAgentConfigurationId,
  });

  await fileResource.uploadContent(auth, revertedContent);

  return new Ok({ fileResource, revertedContent });
}
