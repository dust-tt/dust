import { Conversation, Message, Workspace } from "@app/lib/models";
import {
  ContentFragmentResource,
  storeContentFragmentText,
} from "@app/lib/resources/content_fragment_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { Op } from "sequelize";

const { LIVE } = process.env;

async function migrateContentFragment(
  cfMessage: Message,
  workspaceId: string,
  conversationId: string
) {
  const cf = ContentFragmentResource.fromMessage(cfMessage);
  // if textUrl is null, upload content to GCS and set textUrl to the uploaded file
  // value (also set textBytes to the number of bytes in the content)
  if (!cf.textUrl) {
    const fileUrl = await storeContentFragmentText({
      workspaceId,
      conversationId,
      messageId: cfMessage.sId,
      content: cf.content,
    });
    await cf.update({
      textUrl: fileUrl,
      textBytes: Buffer.byteLength(cf.content),
    });
  }

  // if sourceUrl is null a. if url is not null, set sourceUrl to url b. if url
  // is null, set sourceUrl to textUrl
  if (!cf.sourceUrl) {
    await cf.update({
      sourceUrl: cf.url ?? cf.textUrl,
    });
  }
}

async function migrateContentFragmentsForConversation(
  conversation: Conversation,
  workspaceId: string
) {
  // get all messages of the conversation that have a contentFragment to update
  // (with either sourceUrl or textUrl null and content not empty)
  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
      contentFragmentId: {
        [Op.not]: null,
      },
    },
    include: [
      {
        model: ContentFragmentModel,
        as: "contentFragment",
        where: {
          [Op.and]: [
            {
              [Op.or]: [
                {
                  textUrl: null,
                },
                {
                  sourceUrl: null,
                },
              ],
            },
            {
              content: {
                [Op.ne]: "",
              },
            },
          ],
        },
      },
    ],
  });

  if (LIVE) {
    await Promise.all(
      messages.map((m) =>
        migrateContentFragment(m, workspaceId, conversation.sId)
      )
    );
  }
}

async function migrateContentFragmentsForWorkspace(workspace: Workspace) {
  // get all conversations of the workspace
  const conversations = await Conversation.findAll({
    where: {
      workspaceId: workspace.id,
    },
    attributes: ["id", "sId"],
  });

  // process them by batches of 32
  const chunkSize = 32;
  for (let i = 0; i < conversations.length; i += chunkSize) {
    const chunk = conversations.slice(i, i + chunkSize);
    console.log(
      `Workspace ${workspace.sId}: Processing conversations ${i} to ${
        i + chunkSize
      }...`
    );
    await Promise.all(
      chunk.map((c) => migrateContentFragmentsForConversation(c, workspace.sId))
    );
  }
}

async function main() {
  // get all ids and sIds of workspaces
  const workspaces = await Workspace.findAll({
    attributes: ["id", "sId"],
  });

  // process them by batches of 8
  const chunkSize = 8;
  for (let i = 0; i < workspaces.length; i += chunkSize) {
    const chunk = workspaces.slice(i, i + chunkSize);
    console.log(`Processing workspaces with sIds: ${chunk.map((c) => c.sId)}`);
    await Promise.all(chunk.map(migrateContentFragmentsForWorkspace));
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
