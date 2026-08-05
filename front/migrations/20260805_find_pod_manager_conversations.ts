import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { POD_MANAGER_SERVER_NAME } from "@app/lib/api/actions/servers/pod_manager/metadata";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { makeScript } from "@app/scripts/helpers";
import { isTextContent } from "@app/types/assistant/generation";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { Logger } from "pino";
import { Op } from "sequelize";
import { z } from "zod";

const CreateConversationOutputSchema = z
  .object({
    success: z.literal(true),
    conversationId: z.string(),
  })
  .passthrough();

const CREATED_AT_START = new Date("2026-08-04T09:30:00+02:00");
const CREATED_AT_END = new Date("2026-08-05T16:00:00+02:00");

async function listPodManagerCreateConversationActions(
  auth: Authenticator
): Promise<AgentMCPActionModel[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  const podManagerServerId = autoInternalMCPServerNameToSId({
    name: POD_MANAGER_SERVER_NAME,
    workspaceId,
  });

  const actionModels = await AgentMCPActionModel.findAll({
    attributes: ["id", "createdAt", "toolConfiguration"],
    where: {
      workspaceId,
      createdAt: {
        [Op.gte]: CREATED_AT_START,
        [Op.lte]: CREATED_AT_END,
      },
    },
  });
  const podManagerActions = actionModels.filter(
    (action) =>
      isLightServerSideMCPToolConfiguration(action.toolConfiguration) &&
      action.toolConfiguration.internalMCPServerId === podManagerServerId &&
      action.toolConfiguration.originalName === "create_conversation"
  );

  return podManagerActions.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

async function fetchConversationIDs(
  auth: Authenticator,
  actions: AgentMCPActionModel[]
): Promise<Map<string, AgentMCPActionModel>> {
  if (actions.length === 0) {
    return new Map();
  }

  const outputItemsByActionId =
    await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
      actionIds: actions.map((action) => action.id),
      ignoreContent: false,
    });
  const actionByConversationId = new Map<string, AgentMCPActionModel>();

  for (const action of actions) {
    const outputItems = outputItemsByActionId.get(action.id) ?? [];

    for (const outputItem of outputItems) {
      if (!isTextContent(outputItem.content)) {
        continue;
      }

      const parsedJson = safeParseJSON(outputItem.content.text);
      if (parsedJson.isErr()) {
        continue;
      }

      const parsedOutput = CreateConversationOutputSchema.safeParse(
        parsedJson.value
      );
      if (!parsedOutput.success) {
        continue;
      }

      actionByConversationId.set(parsedOutput.data.conversationId, action);
      break;
    }
  }

  return actionByConversationId;
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      demandOption: true,
      type: "string" as const,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const actions = await listPodManagerCreateConversationActions(auth);
    if (actions.length === 0) {
      return;
    }

    const actionByConversationId = await fetchConversationIDs(
      auth,
      actions
    );

    const conversations = await ConversationResource.fetchByIds(auth, [
      ...actionByConversationId.keys(),
    ]);
    const conversationById = new Map(
      conversations.map((conversation) => [conversation.sId, conversation])
    );

    for (const [conversationId, action] of actionByConversationId) {
      const conversation = conversationById.get(conversationId);
      if (!conversation) {
        logger.warn(
          {
            actionId: action.id,
            conversationId,
          },
          "Conversation from pod_manager output not found"
        );
        continue;
      }

      logger.info(
        {
          actionId: action.id,
          conversationId: conversation.sId,
          conversationCreatedAt: conversation.createdAt,
          depth: conversation.depth,
        },
        "Found conversation created via pod_manager.create_conversation"
      );
    }

    const conversationsToUpdate = conversations.filter(
      // We only take the ones with depth 1, the other ones have been created with sub agents so should remain hidden.
      (conversation) => conversation.depth === 1
    );

    let updatedConversationCount = 0;
    if (execute && conversationsToUpdate.length > 0) {
      [updatedConversationCount] = await ConversationModel.update(
        { depth: 0 },
        {
          where: {
            workspaceId: auth.getNonNullableWorkspace().id,
            id: { [Op.in]: conversationsToUpdate.map(({ id }) => id) },
          },
          // Silent to not update the updatedAt of Sequelize.
          silent: true,
        }
      );
    }

    logger.info(
      {
        execute,
        conversationToUpdateCount: conversationsToUpdate.length,
        updatedConversationCount,
      },
      execute
        ? "Updated pod_manager conversation depths to 0"
        : "Would update pod_manager conversation depths to 0"
    );

    logger.info(
      {
        actionCount: actions.length,
        actionWithConversationOutputCount: actionByConversationId.size,
        conversationCount: conversations.length,
      },
      "Done finding pod_manager conversations"
    );
  }
);
