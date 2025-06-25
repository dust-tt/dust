import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 10000;

async function countImageMarkdownInMessages(
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing agent message contents");

  let imageMarkdownCount = 0;

  // Regex to match image markdown: ![anything](anything)
  const imageMarkdownRegex = /!\[.*?\]\(.*?\)/;

  const messages = await frontSequelize.query<{
    id: number;
    content: string;
  }>(
    `SELECT amc.id, amc.content
     FROM agent_message_contents amc
     WHERE amc.content IS NOT NULL
       AND amc.content != ''
     ORDER BY amc.id DESC
     LIMIT :batchSize`,
    {
      replacements: { batchSize: BATCH_SIZE },
      type: QueryTypes.SELECT,
    }
  );

  logger.info(
    `Processing ${messages.length} most recent agent message contents`
  );

  for (const message of messages) {
    if (imageMarkdownRegex.test(message.content)) {
      imageMarkdownCount++;
    }
  }

  logger.info(
    `Processed ${messages.length} agent message contents. Found ${imageMarkdownCount} messages with image markdown components.`
  );
}

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting image markdown component count migration");

  await countImageMarkdownInMessages(execute, logger);
});
