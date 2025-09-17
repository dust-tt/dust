import {
  CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
  EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
  REVERT_TO_PREVIOUS_EDIT_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/content_creation/types";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/assistant/actions/mcp";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type {
  AgentMessageType,
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

function isCreateAugmentedInputs(
  augmentedInputs: Record<string, unknown>
): augmentedInputs is { content: string } {
  return typeof augmentedInputs.content === "string";
}

function isEditAugmentedInputs(
  augmentedInputs: Record<string, unknown>
): augmentedInputs is { old_string: string; new_string: string } {
  return (
    typeof augmentedInputs.old_string === "string" &&
    typeof augmentedInputs.new_string === "string"
  );
}

function isCreateResourceOutput(
  output: AgentMCPActionOutputItem
): output is AgentMCPActionOutputItem & {
  content: { type: "resource"; resource: { fileId: string } };
} {
  return (
    typeof output.content === "object" &&
    output.content.type === "resource" &&
    output.content.resource &&
    typeof output.content.resource.fileId === "string"
  );
}

export async function revertClientExecutableFileToPreviousState(
  auth: Authenticator,
  params: {
    fileId: string;
    conversationId: number;
    currentAgentMessage: AgentMessageType;
    revertedByAgentConfigurationId?: string;
  }
): Promise<
  Result<{ fileResource: FileResource; revertedContent: string }, Error>
> {
  const {
    fileId,
    conversationId,
    currentAgentMessage,
    revertedByAgentConfigurationId,
  } = params;

  try {
    const fileResource = await FileResource.fetchById(auth, fileId);
    if (!fileResource) {
      return new Err(new Error(`File not found: ${fileId}`));
    }

    if (fileResource.contentType !== clientExecutableContentType) {
      return new Err(
        new Error(
          `File '${fileId}' is not a content creation file (content type: ${fileResource.contentType})`
        )
      );
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    const allActions = await AgentMCPActionModel.findAll({
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
        {
          model: AgentMCPActionOutputItem,
          as: "outputItems",
          required: false,
        },
      ],
      where: {
        workspaceId,
        status: "succeeded",
      },
    });

    if (allActions.length === 0) {
      return new Err(new Error("No MCP actions found for this conversation"));
    }

    const outputItemsByActionId = new Map<number, AgentMCPActionOutputItem[]>();
    for (const action of allActions) {
      if (action.outputItems && action.outputItems.length > 0) {
        outputItemsByActionId.set(action.id, action.outputItems);
      }
    }

    const fileActions = allActions
      .filter((action) => {
        const toolName = action.toolConfiguration.originalName;
        const fileIdFromInput = action.augmentedInputs?.file_id;

        if (toolName === CREATE_CONTENT_CREATION_FILE_TOOL_NAME) {
          if (!isCreateAugmentedInputs(action.augmentedInputs)) {
            return new Err(
              new Error(
                `Invalid augmented inputs for create action for file '${fileId}'`
              )
            );
          }

          const resourceOutput = outputItemsByActionId
            .get(action.id)
            ?.find((o) => o.content?.type === "resource");

          if (!resourceOutput || !isCreateResourceOutput(resourceOutput)) {
            return new Err(
              new Error(
                `Invalid resource output for create action for file '${fileId}'`
              )
            );
          }

          const actionFileId = resourceOutput?.content.resource.fileId;
          const isFileCreateAction = actionFileId === fileId;
          return isFileCreateAction;
        }

        if (toolName === EDIT_CONTENT_CREATION_FILE_TOOL_NAME) {
          return fileIdFromInput === fileId;
        }

        if (toolName === REVERT_TO_PREVIOUS_EDIT_TOOL_NAME) {
          return fileIdFromInput === fileId;
        }

        return false;
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (fileActions.length === 0) {
      return new Err(new Error(`No MCP actions found for file '${fileId}'`));
    }

    // Check if the most recent action is a revert, if true then return an error
    const mostRecentAction = fileActions[fileActions.length - 1];
    if (
      mostRecentAction?.toolConfiguration.originalName ===
      REVERT_TO_PREVIOUS_EDIT_TOOL_NAME
    ) {
      return new Err(
        new Error(`Last action is a revert, cannot revert twice in a row`)
      );
    }

    // Find the most recent revert action and the create action
    let lastRevertActionIndex = -1;
    let createActionIndex = -1;

    // Find the index of the most recent revert action and the create action
    for (let i = fileActions.length - 1; i >= 0; i--) {
      const toolName = fileActions[i].toolConfiguration.originalName;

      if (
        toolName === REVERT_TO_PREVIOUS_EDIT_TOOL_NAME &&
        lastRevertActionIndex === -1
      ) {
        lastRevertActionIndex = i;
      }

      if (toolName === CREATE_CONTENT_CREATION_FILE_TOOL_NAME) {
        createActionIndex = i;
        break;
      }
    }

    if (createActionIndex === -1) {
      return new Err(new Error(`No create action found for file '${fileId}'`));
    }

    // Determine starting content and starting agent message
    let startingContent: string;
    let startingAgentMessageId: ModelId;

    // If there's a revert action, extract content from its output
    if (lastRevertActionIndex !== -1) {
      const revertAction = fileActions[lastRevertActionIndex];
      startingAgentMessageId = revertAction.agentMessageId;

      // Extract content from revert action's output items
      const revertItemOutput = outputItemsByActionId
        .get(revertAction.id)
        ?.find((o) => o.content?.type === "text");

      if (!revertItemOutput) {
        return new Err(
          new Error(
            `Could not find reverted content in revert action for file '${fileId}'`
          )
        );
      }

      if (
        !revertItemOutput.content ||
        revertItemOutput.content.type !== "text"
      ) {
        return new Err(
          new Error(
            `Could not find reverted content in revert action for file '${fileId}'`
          )
        );
      }

      startingContent = revertItemOutput.content.text;
    } else {
      // Use original content from create action
      const createAction = fileActions[createActionIndex];
      startingAgentMessageId = createAction.agentMessageId;
      if (!isCreateAugmentedInputs(createAction.augmentedInputs)) {
        return new Err(
          new Error(
            `Invalid augmented inputs for create action for file '${fileId}'`
          )
        );
      }

      const originalContent = createAction.augmentedInputs.content;

      startingContent = originalContent;
    }

    // Find the starting point
    const startIndex = fileActions.findIndex(
      (action) => action.agentMessageId === startingAgentMessageId
    );

    if (startIndex === -1) {
      return new Err(
        new Error("Could not find starting agent message for revert")
      );
    }

    let revertedContent = startingContent;

    const currentAgentMessageIndex = fileActions.findIndex(
      (action) => action.agentMessageId === currentAgentMessage.agentMessageId
    );

    logger.info(
      {
        currentAgentMessageIndex,
        startIndex,
        fileActionsLength: fileActions.length,
        startingAgentMessageId,
      },
      "Current agent message index"
    );

    for (let i = startIndex + 1; i < fileActions.length; i++) {
      const action = fileActions[i];

      // Stop when we reach the previous agent message
      if (i >= currentAgentMessageIndex - 1) {
        break;
      }

      if (
        action.toolConfiguration.originalName ===
        EDIT_CONTENT_CREATION_FILE_TOOL_NAME
      ) {
        if (!isEditAugmentedInputs(action.augmentedInputs)) {
          return new Err(
            new Error(
              `Invalid augmented inputs for edit action for file '${fileId}'`
            )
          );
        }

        const { old_string, new_string } = action.augmentedInputs;
        logger.info(
          { old_string, new_string },
          "Replacing string in reverted content"
        );

        revertedContent = revertedContent.replace(new_string, old_string);
      }
    }

    await fileResource.uploadContent(auth, revertedContent);

    if (revertedByAgentConfigurationId) {
      await fileResource.setUseCaseMetadata({
        ...fileResource.useCaseMetadata,
        lastEditedByAgentConfigurationId: revertedByAgentConfigurationId,
      });
    }

    return new Ok({ fileResource, revertedContent });
  } catch (error) {
    return new Err(
      new Error(
        `Failed to revert file '${fileId}' to previous state: ${normalizeError(error)}`
      )
    );
  }
}
