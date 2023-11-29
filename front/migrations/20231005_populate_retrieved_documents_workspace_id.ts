import { Op } from "sequelize";

import {
  AgentMessage,
  Conversation,
  Message,
  RetrievalDocument,
  Workspace,
} from "@app/lib/models";
import { ModelId } from "@dust-tt/types";

const { LIVE = false } = process.env;

async function main() {
  console.log("Fetching Upgraded Worspaces...");
  const workspaces = await Workspace.findAll({});
  console.log(
    `Found ${workspaces.length} workspaces for which to add largeModels = true`
  );

  const chunkSize = 16;
  const chunks = [];
  for (let i = 0; i < workspaces.length; i += chunkSize) {
    chunks.push(workspaces.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((workspace: Workspace) => {
        return updateAllConversations(!!LIVE, workspace);
      })
    );
  }
}

async function updateAllConversations(live: boolean, workspace: Workspace) {
  const conversations = await Conversation.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });

  const chunkSize = 16;
  const chunks = [];
  for (let i = 0; i < conversations.length; i += chunkSize) {
    chunks.push(conversations.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((c: Conversation) => {
        return updateConversation(live, c, workspace);
      })
    );
  }
}

async function updateConversation(
  live: boolean,
  conversation: Conversation,
  workspace: Workspace
) {
  const messages = await Message.findAll({
    where: {
      // where conversationId = conversation.id
      // and agentMessageId is not null
      [Op.and]: [
        {
          conversationId: conversation.id,
          agentMessageId: {
            [Op.ne]: null,
          },
        },
      ],
    },
  });

  await Promise.all(
    messages.map((message) => {
      return updateMessage(
        live,
        conversation,
        message.agentMessageId as number,
        workspace
      );
    })
  );
}

async function updateMessage(
  live: boolean,
  conversation: Conversation,
  agentMessageId: ModelId,
  workspace: Workspace
) {
  const m = await AgentMessage.findByPk(agentMessageId);
  if (m?.agentRetrievalActionId) {
    const documents = await RetrievalDocument.findAll({
      where: {
        retrievalActionId: m.agentRetrievalActionId,
      },
    });
    console.log(
      `LIVE=${live} workspace=${workspace.sId} conversation=${conversation.sId} documents=${documents.length}`
    );

    if (live) {
      await RetrievalDocument.update(
        {
          dataSourceWorkspaceId: workspace.sId,
        },
        {
          where: {
            retrievalActionId: m.agentRetrievalActionId,
          },
        }
      );
    }
  }
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
