import { Op } from "sequelize";

import {
  CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
  EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
  REVERT_LAST_EDIT_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/content_creation/types";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { ContentCreationFileContentType, Result } from "@app/types";
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

  // Count occurrences of oldString.
  const regex = new RegExp(
    oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "g"
  );
  const matches = currentContent.match(regex);
  const occurrences = matches ? matches.length : 0;

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

  // Perform the replacement.
  const updatedContent = currentContent.replace(regex, newString);

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

function isCreateFileAction(
  action: AgentMCPActionModel
): action is AgentMCPActionModel & { augmentedInputs: { content: string } } {
  return (
    action.toolConfiguration.originalName ===
      CREATE_CONTENT_CREATION_FILE_TOOL_NAME &&
    typeof action.augmentedInputs.content === "string"
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

function isCreateFileResourceOutput(
  output: AgentMCPActionOutputItem
): output is AgentMCPActionOutputItem & {
  content: { type: "resource"; resource: { fileId: string } };
} {
  return (
    output.content.type === "resource" &&
    output.content.resource &&
    typeof output.content.resource.fileId === "string"
  );
}

function isRevertFileActionOutput(
  output: AgentMCPActionOutputItem
): output is AgentMCPActionOutputItem & {
  content: { type: "text"; text: string };
} {
  return (
    output.content.type === "text" && typeof output.content.text === "string"
  );
}

async function fetchEditOrRevertActionsForFile(
  auth: Authenticator,
  fileId: string,
  conversationId: number
): Promise<AgentMCPActionModel[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  // TODO (content-creation): Use AgentMCPActionResource instead of AgentMCPActionModel
  return AgentMCPActionModel.findAll({
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
      [Op.and]: [
        {
          [Op.or]: [
            {
              "toolConfiguration.originalName":
                EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
            },
            { "toolConfiguration.originalName": REVERT_LAST_EDIT_TOOL_NAME },
          ],
        },
        { "augmentedInputs.file_id": fileId },
      ],
    },
    order: [["createdAt", "ASC"]],
  });
}

async function fetchCreateActionsForConversation(
  auth: Authenticator,
  conversationId: number
): Promise<AgentMCPActionModel[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  return AgentMCPActionModel.findAll({
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
      "toolConfiguration.originalName": CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
    },
    order: [["createdAt", "ASC"]],
  });
}

async function getFileActions(
  auth: Authenticator,
  fileId: string,
  conversationId: number
): Promise<AgentMCPActionModel[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  // Get edit and revert actions for the file
  const editOrRevertActions = await fetchEditOrRevertActionsForFile(
    auth,
    fileId,
    conversationId
  );

  logger.info({ editOrRevertActions }, "Edit or revert actions");

  // Get create actions for the file
  const createActions = await fetchCreateActionsForConversation(
    auth,
    conversationId
  );

  logger.info({ createActions }, "Create actions");

  // Find the create action that created our file
  const fileCreationAction = await findCreateActionForFile(
    createActions,
    fileId,
    workspaceId
  );

  const allFileActions = fileCreationAction
    ? [...editOrRevertActions, fileCreationAction]
    : editOrRevertActions;

  logger.info({ allFileActions }, "All file actions");

  return allFileActions.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
}

async function getOutputItemsForActions(
  actionIds: number[],
  workspaceId: number
): Promise<Map<number, AgentMCPActionOutputItem[]>> {
  if (actionIds.length === 0) {
    return new Map();
  }

  const outputs = await AgentMCPActionOutputItem.findAll({
    where: {
      agentMCPActionId: { [Op.in]: actionIds },
      workspaceId,
    },
    order: [["createdAt", "ASC"]],
  });

  return outputs.reduce((map, output) => {
    const existing = map.get(output.agentMCPActionId) ?? [];
    existing.push(output);
    map.set(output.agentMCPActionId, existing);
    return map;
  }, new Map<number, AgentMCPActionOutputItem[]>());
}

async function getOutputForAction(
  actionId: number,
  workspaceId: number
): Promise<
  | (AgentMCPActionOutputItem & { content: { type: "text"; text: string } })
  | null
> {
  const outputs = await AgentMCPActionOutputItem.findAll({
    where: {
      agentMCPActionId: actionId,
      workspaceId,
    },
    order: [["createdAt", "ASC"]],
  });

  const revertOutput = outputs.find((output) =>
    isRevertFileActionOutput(output)
  );
  return revertOutput
    ? (revertOutput as AgentMCPActionOutputItem & {
        content: { type: "text"; text: string };
      })
    : null;
}

async function findCreateActionForFile(
  createActions: AgentMCPActionModel[],
  fileId: string,
  workspaceId: number
): Promise<AgentMCPActionModel | null> {
  if (createActions.length === 0) {
    return null;
  }

  // Get output items for create actions to check which one created our file
  const outputItems = await getOutputItemsForActions(
    createActions.map((action) => action.id),
    workspaceId
  );

  return (
    createActions.find((action) => {
      const resourceOutput = outputItems.get(action.id)?.find(
        (
          output
        ): output is AgentMCPActionOutputItem & {
          content: { type: "resource"; resource: { fileId: string } };
        } => isCreateFileResourceOutput(output)
      );

      if (!resourceOutput) {
        return false;
      }

      return resourceOutput.content.resource.fileId === fileId;
    }) ?? null
  );
}

export async function revertClientExecutableFileToPreviousState(
  auth: Authenticator,
  {
    fileId,
    conversationId,
    revertedByAgentConfigurationId,
  }: {
    fileId: string;
    conversationId: number;
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

  const workspaceId = auth.getNonNullableWorkspace().id;

  const fileActions = await getFileActions(auth, fileId, conversationId);

  if (fileActions.length === 0) {
    return new Err({
      message: "No MCP actions found for this file",
      tracked: true,
    });
  }

  // Validate that the most recent action is not already a revert
  const mostRecentAction = fileActions[fileActions.length - 1];

  if (
    mostRecentAction?.toolConfiguration.originalName ===
    CREATE_CONTENT_CREATION_FILE_TOOL_NAME
  ) {
    return new Err({
      message: "Last action is a create, cannot revert to a create",
      tracked: false,
    });
  }

  if (
    mostRecentAction?.toolConfiguration.originalName ===
    REVERT_LAST_EDIT_TOOL_NAME
  ) {
    return new Err({
      message: "Last action is a revert, cannot revert twice in a row",
      tracked: false,
    });
  }

  let lastRevertIndex = -1;
  let createActionIndex = -1;

  // Search backwards through actions to find:
  // - The most recent revert action (if any)
  // - The create action (there should be exactly one)
  for (let i = fileActions.length - 1; i >= 0; i--) {
    const toolName = fileActions[i].toolConfiguration.originalName;

    if (toolName === REVERT_LAST_EDIT_TOOL_NAME && lastRevertIndex === -1) {
      lastRevertIndex = i;
    }

    if (toolName === CREATE_CONTENT_CREATION_FILE_TOOL_NAME) {
      createActionIndex = i;
      break;
    }
  }

  if (createActionIndex === -1) {
    return new Err({
      message: `No create action found for file '${fileId}'`,
      tracked: false,
    });
  }

  let startingContent: string;
  let startIndex: number;

  // If there was a previous revert, use its output as our baseline
  if (lastRevertIndex !== -1) {
    const revertAction = fileActions[lastRevertIndex];
    startIndex = lastRevertIndex;

    const revertItemOutput = await getOutputForAction(
      revertAction.id,
      workspaceId
    );

    if (!revertItemOutput) {
      return new Err({
        message: `Could not find reverted content in revert action for file '${fileId}'`,
        tracked: false,
      });
    }

    startingContent = revertItemOutput.content.text;
  } else {
    // Otherwise, use the original content from file creation
    const createAction = fileActions[createActionIndex];
    startIndex = createActionIndex;

    if (!isCreateFileAction(createAction)) {
      return new Err({
        message: `Invalid augmented inputs for create action for file '${fileId}'`,
        tracked: false,
      });
    }

    startingContent = createAction.augmentedInputs.content;
  }

  let revertedContent = startingContent;

  const cutoffAgentMessageId =
    fileActions[fileActions.length - 1].agentMessageId;

  // Reapply edit actions chronologically to reconstruct the previous valid state
  for (let i = startIndex + 1; i < fileActions.length; i++) {
    const action = fileActions[i];

    if (action.agentMessageId === cutoffAgentMessageId) {
      break;
    }

    if (!isEditFileAction(action)) {
      return new Err({
        message: `Invalid augmented inputs for edit action for file '${fileId}'`,
        tracked: false,
      });
    }

    const { old_string, new_string } = action.augmentedInputs;
    revertedContent = revertedContent.replace(old_string, new_string);
  }

  await fileResource.setUseCaseMetadata({
    ...fileResource.useCaseMetadata,
    lastEditedByAgentConfigurationId: revertedByAgentConfigurationId,
  });

  await fileResource.uploadContent(auth, revertedContent);

  return new Ok({ fileResource, revertedContent });
}
