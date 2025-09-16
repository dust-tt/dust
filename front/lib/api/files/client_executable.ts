import _ from "lodash";
import { Op } from "sequelize";

import {
  CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
  EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
  REVERT_TO_PREVIOUS_EDIT_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/content_creation/types";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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

export async function revertClientExecutableFileToPreviousState(
  auth: Authenticator,
  params: {
    fileId: string;
    conversationId: string;
    currentAgentMessage: AgentMessageType;
    revertedByAgentConfigurationId?: string;
  }
): Promise<Result<FileResource, Error>> {
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

    // Resolve conversation numeric id from sId
    const conversationRes = await ConversationResource.fetchById(
      auth,
      conversationId
    );

    if (!conversationRes) {
      return new Err(new Error(`Conversation not found: ${conversationId}`));
    }

    logger.info(
      { conversationResId: conversationRes.id },
      "Conversation found"
    );

    // Gather agent messages for the conversation
    const agentMessages = await AgentMessage.findAll({
      where: { workspaceId },
      include: [
        {
          model: Message,
          as: "message",
          where: { conversationId: conversationRes.id, workspaceId },
          required: true,
        },
      ],
      attributes: ["id"],
    });

    logger.info({ agentMessages }, "Agent messages found");

    const agentMessageIds: ModelId[] = agentMessages.map((am) => am.id);
    if (agentMessageIds.length === 0) {
      return new Err(new Error("No MCP actions found for this conversation"));
    }

    const allActions = await AgentMCPActionResource.listByAgentMessageIds(
      auth,
      agentMessageIds
    );

    // Load output items and attach for easy access
    const actionIds = allActions.map((a) => a.id);
    const outputItemsByActionId = _.groupBy(
      await AgentMCPActionOutputItem.findAll({
        where: { workspaceId, agentMCPActionId: { [Op.in]: actionIds } },
      }),
      "agentMCPActionId"
    );

    for (const a of allActions) {
      (a as any).outputItems = outputItemsByActionId[a.id.toString()] ?? [];
    }

    logger.info({ allActions }, "All actions");

    // Filter by fileId (support `file_id` in augmentedInputs)
    const fileActions = allActions
      .filter((action) => {
        const name = action.toolConfiguration.originalName;
        const inputs = action.augmentedInputs as any;
        const fid = inputs?.file_id;

        // we only keep create, edit, and revert actions
        if (name === CREATE_CONTENT_CREATION_FILE_TOOL_NAME) {
          return true;
        }

        if (name === EDIT_CONTENT_CREATION_FILE_TOOL_NAME) {
          return fid === fileId;
        }

        if (name === REVERT_TO_PREVIOUS_EDIT_TOOL_NAME) {
          return fid === fileId;
        }

        return false;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    logger.info({ fileActions }, "File actions");

    if (fileActions.length === 0) {
      return new Err(new Error(`No MCP actions found for file '${fileId}'`));
    }

    // Find last revert and last create
    let lastRevertIndex = -1;
    let createActionIndex = -1;

    for (let i = 0; i < fileActions.length; i++) {
      const name = fileActions[i].toolConfiguration.originalName;
      if (
        name === REVERT_TO_PREVIOUS_EDIT_TOOL_NAME &&
        lastRevertIndex === -1
      ) {
        lastRevertIndex = i;
      }

      if (name === CREATE_CONTENT_CREATION_FILE_TOOL_NAME) {
        createActionIndex = i;
        break;
      }
    }

    if (createActionIndex === -1) {
      return new Err(new Error(`No create action found for file '${fileId}'`));
    }

    logger.info(
      { lastRevertIndex, createActionIndex },
      "Last revert index and create action index"
    );

    // Determine starting content and starting agent message
    let startingContent: string;
    let startingAgentMessageId: ModelId;

    // TODO: change to !== -1 after testing
    if (lastRevertIndex === -1000) {
      const revertAction: any = fileActions[lastRevertIndex];
      startingAgentMessageId = revertAction.agentMessageId;

      // Find reverted content stored as JSON with a `content` field
      const outputItems: any[] = (revertAction as any).outputItems ?? [];
      let recoveredContent: string | null = null;
      for (const item of outputItems) {
        const c = item?.content;
        if (!c || typeof c !== "object") {
          continue;
        }

        // Case 1: text payload containing JSON
        if (typeof (c as any).text === "string") {
          const t = (c as any).text as string;
          try {
            const parsed = JSON.parse(t);
            if (parsed && typeof parsed.content === "string") {
              recoveredContent = parsed.content;
              break;
            }
          } catch {
            // ignore non-JSON text
          }
        }

        // Case 2: structured payload already has a content field
        if (typeof (c as any).content === "string") {
          recoveredContent = (c as any).content;
          break;
        }

        // Case 3: nested shapes like json/value
        const nested = (c as any).json ?? (c as any).value ?? undefined;
        if (nested && typeof nested.content === "string") {
          recoveredContent = nested.content;
          break;
        }
      }

      if (!recoveredContent) {
        return new Err(
          new Error(
            `Could not find reverted content JSON with a 'content' field for file '${fileId}'`
          )
        );
      }
      startingContent = recoveredContent;
    } else {
      const createAction = fileActions[createActionIndex];
      startingAgentMessageId = createAction.agentMessageId;
      const originalContent = (createAction.augmentedInputs as any)?.content;
      if (typeof originalContent !== "string") {
        return new Err(
          new Error(
            `No original content found in create action for file '${fileId}'`
          )
        );
      }

      startingContent = originalContent;
    }

    // Group actions by agent message (keeps chronological order after grouping)
    let currentContent: string = startingContent;

    const actionsByAgentMessage = new Map<ModelId, typeof fileActions>();
    for (const action of fileActions) {
      if (!actionsByAgentMessage.has(action.agentMessageId)) {
        actionsByAgentMessage.set(action.agentMessageId, []);
      }

      actionsByAgentMessage.get(action.agentMessageId)!.push(action);
    }

    const sortedAgentMsgIds = Array.from(actionsByAgentMessage.keys()).sort(
      (a, b) => {
        const a0 = actionsByAgentMessage.get(a)![0];
        const b0 = actionsByAgentMessage.get(b)![0];
        return a0.createdAt.getTime() - b0.createdAt.getTime();
      }
    );

    logger.info({ sortedAgentMsgIds }, "Sorted agent message ids");

    logger.info(
      {
        startingAgentMessageId,
        currentAgentMessageId: currentAgentMessage.agentMessageId,
        currentAgentMessage,
      },
      "Starting and current agent message ids"
    );

    const startIdx = sortedAgentMsgIds.indexOf(startingAgentMessageId);
    const endIdx = sortedAgentMsgIds.indexOf(
      currentAgentMessage.agentMessageId
    );

    if (startIdx === -1 || endIdx === -1) {
      return new Err(new Error("Agent message bounds not found for revert"));
    }

    for (let i = startIdx + 1; i < endIdx; i++) {
      const actions = actionsByAgentMessage.get(sortedAgentMsgIds[i]) || [];
      for (const a of actions) {
        if (
          a.toolConfiguration.originalName ===
          EDIT_CONTENT_CREATION_FILE_TOOL_NAME
        ) {
          const args = a.augmentedInputs as any;
          if (args?.old_string && args?.new_string) {
            currentContent = currentContent.replace(
              args.old_string,
              args.new_string
            );
          }
        }
      }
    }

    // Write the reverted content back to the file
    // await fileResource.uploadContent(auth, currentContent);
    logger.info({ currentContent }, "Current content");

    // if (revertedByAgentConfigurationId) {
    //   await fileResource.setUseCaseMetadata({
    //     ...fileResource.useCaseMetadata,
    //     lastEditedByAgentConfigurationId: revertedByAgentConfigurationId,
    //   });
    // }

    logger.info(
      { revertedByAgentConfigurationId },
      "Reverted by agent configuration id"
    );
    logger.info(
      "revertedByAgentConfigurationId",
      { fileId, currentAgentMessageId: currentAgentMessage.sId },
      "Reverted content creation file to previous state"
    );

    return new Ok(fileResource);
  } catch (error) {
    return new Err(
      new Error(
        `Failed to revert file '${params.fileId}' to previous state: ${normalizeError(error)}`
      )
    );
  }
}
