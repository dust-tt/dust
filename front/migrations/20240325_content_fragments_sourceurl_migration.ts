import { Op } from "sequelize";

import { Message } from "@app/lib/models/assistant/conversation";
import { ContentFragmentResource } from "@app/lib/resources/content_fragment_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";

const { LIVE } = process.env;

async function main() {
  // get all messages that are content fragments, and whose content fragment's sourceUrl field starts with
  // "https://storage.googleapis.com/"
  // by batches of 128

  let messages = [];
  do {
    messages = await Message.findAll({
      where: {
        contentFragmentId: {
          [Op.not]: null,
        },
      },
      include: [
        {
          model: ContentFragmentModel,
          as: "contentFragment",
          where: {
            sourceUrl: {
              [Op.startsWith]: "https://storage.googleapis.com/",
            },
          },
        },
      ],
      limit: 128,
    });
    // reset sourceUrl to null for those content fragments in parallel
    if (LIVE) {
      console.log(`Processing ${messages.length} messages`);
      await Promise.all(
        messages.map(async (message) => {
          const cf = ContentFragmentResource.fromMessage(message);
          await cf.setSourceUrl(null);
        })
      );
    }
  } while (messages.length > 0 && LIVE);
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
