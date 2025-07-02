import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Logger } from "pino";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import { ConversationIncludeFileActionType } from "@app/lib/actions/conversation/include_file";
import type { ActionBaseParams } from "@app/lib/actions/mcp";
import { conversationAttachmentId } from "@app/lib/api/assistant/conversation/attachments";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import { AgentConversationIncludeFileAction } from "@app/lib/models/assistant/actions/conversation/include_file";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType, ModelId } from "@app/types";
import { GPT_4O_MODEL_CONFIG } from "@app/types";
import { isGlobalAgentId, isImageContent, isTextContent } from "@app/types";

const WORKSPACE_CONCURRENCY = 50;
const BATCH_SIZE = 200;
const CREATION_CONCURRENCY = 50;

// Types for the resources that are output by the conversation_files MCP server.
type ConversationFileOutputResource = {
  uri: string;
  mimeType: string;
  text: string;
};

function agentConversationIncludeFileActionToAgentMCPAction(
  includeFileAction: AgentConversationIncludeFileAction,
  agentConfiguration: AgentConfiguration | null,
  {
    mcpServerViewForConversationFilesId,
  }: {
    mcpServerViewForConversationFilesId: ModelId;
  },
  logger: Logger
): {
  action: ActionBaseParams & CreationAttributes<AgentMCPAction>;
} {
  logger.info(
    { mcpServerViewForConversationFilesId },
    "Found MCP server view ID for Conversation Files"
  );

  // Find the MCP server configuration for Conversation Files.
  const conversationFilesMcpServerConfiguration =
    agentConfiguration?.mcpServerConfigurations.find(
      (config) => config.mcpServerViewId === mcpServerViewForConversationFilesId
    );

  // For conversation include file actions, we always use the hardcoded -1 ID
  // since they are primarily JIT actions.
  const mcpServerConfigurationId = "-1";

  logger.info(
    {
      includeFileActionId: includeFileAction.id,
      mcpServerConfigurationId,
    },
    "Converted Conversation Include File action to MCP action"
  );

  return {
    action: {
      agentMessageId: includeFileAction.agentMessageId,
      functionCallId: includeFileAction.functionCallId,
      functionCallName: includeFileAction.functionCallName,
      createdAt: includeFileAction.createdAt,
      updatedAt: includeFileAction.updatedAt,
      generatedFiles: [],
      mcpServerConfigurationId,
      params: { fileId: includeFileAction.fileId },
      step: includeFileAction.step,
      workspaceId: includeFileAction.workspaceId,
      isError: false,
      executionState: "allowed_implicitly",
    },
  };
}

function createOutputItem({
  content,
  agentMCPAction,
  includeFileAction,
}: {
  content:
    | { type: "text"; text: string }
    | { type: "resource"; resource: ConversationFileOutputResource };
  agentMCPAction: AgentMCPAction;
  includeFileAction: AgentConversationIncludeFileAction;
}): CreationAttributes<AgentMCPActionOutputItem> {
  return {
    agentMCPActionId: agentMCPAction.id,
    content,
    createdAt: includeFileAction.createdAt,
    updatedAt: includeFileAction.updatedAt,
    workspaceId: includeFileAction.workspaceId,
  };
}

// Recreate the output as if it came from the conversation_files MCP server.
async function getContentForConversationIncludeFileAction(
  includeFileAction: AgentConversationIncludeFileAction,
  {
    auth,
    conversation,
  }: {
    auth: Authenticator;
    conversation: ConversationResource;
  }
): Promise<
  (
    | { type: "text"; text: string }
    | { type: "resource"; resource: ConversationFileOutputResource }
  )[]
> {
  // We take 4o because is supports vision.
  const model = getSupportedModelConfig(GPT_4O_MODEL_CONFIG);

  // Use the same logic as the conversation_files MCP server
  const fileRes = await ConversationIncludeFileActionType.fileFromConversation(
    auth,
    includeFileAction.fileId,
    conversation,
    model
  );

  if (fileRes.isErr()) {
    // Return empty array for errors - the original action likely failed
    return [];
  }

  const { content, title } = fileRes.value;

  // Get the file metadata to extract the actual content type
  const attachments = listAttachments(conversation);
  const attachment = attachments.find(
    (a) => conversationAttachmentId(a) === includeFileAction.fileId
  );

  if (isTextContent(content)) {
    return [
      {
        type: "text",
        text: content.text,
      },
    ];
  } else if (isImageContent(content)) {
    // For images, we return the URL as a resource with the correct MIME type
    return [
      {
        type: "resource",
        resource: {
          uri: content.image_url.url,
          mimeType: attachment?.contentType || "application/octet-stream",
          text: `Image: ${title}`,
        },
      },
    ];
  }

  // Return empty array if no usable content
  return [];
}

async function migrateSingleConversationIncludeFileAction(
  auth: Authenticator,
  includeFileAction: AgentConversationIncludeFileAction,
  agentConfiguration: AgentConfiguration | null,
  conversation: ConversationResource,
  logger: Logger,
  {
    execute,
    mcpServerViewForConversationFilesId,
  }: {
    execute: boolean;
    mcpServerViewForConversationFilesId: ModelId;
  }
) {
  // Step 1: Convert the legacy Conversation Include File action to an MCP action
  const mcpAction = agentConversationIncludeFileActionToAgentMCPAction(
    includeFileAction,
    agentConfiguration ?? null,
    {
      mcpServerViewForConversationFilesId,
    },
    logger
  );

  // Step 2: Prepare output items from the Conversation Include File action
  if (execute) {
    // Step 3: Create the MCP action
    const mcpActionCreated = await AgentMCPAction.create(mcpAction.action);

    // Step 4: Create output items for the action results
    const contentItems = await getContentForConversationIncludeFileAction(
      includeFileAction,
      {
        auth,
        conversation,
      }
    );

    // Step 5: Create all output items
    await AgentMCPActionOutputItem.bulkCreate(
      contentItems.map((content) =>
        createOutputItem({
          content,
          agentMCPAction: mcpActionCreated,
          includeFileAction,
        })
      )
    );

    logger.info(
      {
        includeFileActionId: includeFileAction.id,
        mcpActionId: mcpActionCreated.id,
        outputItemsCount: contentItems.length,
      },
      "Successfully migrated Conversation Include File action to MCP"
    );
  }
}

async function migrateWorkspaceConversationIncludeFileActions(
  workspace: LightWorkspaceType,
  logger: Logger,
  { execute }: { execute: boolean }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const mcpServerViewForConversationFiles =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "conversation_files"
    );

  assert(
    mcpServerViewForConversationFiles,
    "Conversation Files MCP server view must exist"
  );

  let hasMore = false;
  let lastId = 0;
  do {
    // Step 1: Retrieve the legacy Conversation Include File actions
    const includeFileActions = await AgentConversationIncludeFileAction.findAll(
      {
        where: {
          workspaceId: workspace.id,
          id: {
            [Op.gt]: lastId,
          },
        },
        limit: BATCH_SIZE,
        order: [["id", "ASC"]],
      }
    );

    if (includeFileActions.length === 0) {
      return;
    }

    logger.info(
      `Found ${includeFileActions.length} Conversation Include File actions`
    );

    // Step 2: Find the corresponding AgentMessages with their Messages (to get conversationId)
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: {
          [Op.in]: includeFileActions.map((action) => action.agentMessageId),
        },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: Message,
          as: "message",
          required: true,
        },
      ],
    });

    // Step 3: Find the corresponding Conversations
    const conversationIds = [
      ...new Set(
        agentMessages
          .map((agentMessage) => agentMessage.message?.conversationId)
          .filter(Boolean)
      ),
    ];

    const conversations = await ConversationResource.fetchByIds(
      auth,
      conversationIds
    );

    const conversationsMap = new Map(
      conversations.map((conversation) => [conversation.id, conversation])
    );

    // Step 4: Find the corresponding AgentConfigurations
    const agentConfigurationSIds = [
      ...new Set(agentMessages.map((message) => message.agentConfigurationId)),
    ];

    const agentConfigurations = await AgentConfiguration.findAll({
      where: {
        sId: {
          [Op.in]: agentConfigurationSIds,
        },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMCPServerConfiguration,
          as: "mcpServerConfigurations",
        },
      ],
    });

    const agentConfigurationsMap = new Map(
      agentConfigurations.map((config) => [
        `${config.sId}-${config.version}`,
        config,
      ])
    );

    const agentMessagesMap = new Map(
      agentMessages.map((message) => [message.id, message])
    );

    // Step 5: Create the MCP actions with their output items
    await concurrentExecutor(
      includeFileActions,
      async (includeFileAction) => {
        const agentMessage = agentMessagesMap.get(
          includeFileAction.agentMessageId
        );
        assert(agentMessage, "Agent message must exist");

        const conversation = conversationsMap.get(
          agentMessage.message?.conversationId
        );
        assert(conversation, "Conversation must exist");

        const agentConfiguration = agentConfigurationsMap.get(
          `${agentMessage.agentConfigurationId}-${agentMessage.agentConfigurationVersion}`
        );
        assert(
          agentConfiguration ||
            isGlobalAgentId(agentMessage.agentConfigurationId),
          `Agent configuration must exist for agent ${agentMessage.agentConfigurationId}`
        );

        await migrateSingleConversationIncludeFileAction(
          auth,
          includeFileAction,
          agentConfiguration ?? null,
          conversation,
          logger,
          {
            execute,
            mcpServerViewForConversationFilesId:
              mcpServerViewForConversationFiles.id,
          }
        );
      },
      {
        concurrency: CREATION_CONCURRENCY,
      }
    );

    // Step 6: Delete the legacy Conversation Include File actions
    if (execute) {
      await AgentConversationIncludeFileAction.destroy({
        where: {
          id: {
            [Op.in]: includeFileActions.map((action) => action.id),
          },
          workspaceId: workspace.id,
        },
      });
    }

    hasMore = includeFileActions.length === BATCH_SIZE;
    lastId = includeFileActions[includeFileActions.length - 1].id;
  } while (hasMore);
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace ID to migrate",
      required: false,
    },
  },
  async ({ execute, workspaceId }, parentLogger) => {
    const logger = parentLogger.child({ workspaceId });

    if (workspaceId) {
      const workspace = await getWorkspaceInfos(workspaceId);

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      await migrateWorkspaceConversationIncludeFileActions(workspace, logger, {
        execute,
      });
    } else {
      await runOnAllWorkspaces(
        async (workspace) =>
          migrateWorkspaceConversationIncludeFileActions(
            workspace,
            logger.child({ workspaceId: workspace.sId }),
            {
              execute,
            }
          ),
        {
          concurrency: WORKSPACE_CONCURRENCY,
        }
      );
    }
  }
);
