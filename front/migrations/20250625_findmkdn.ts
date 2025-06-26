import { QueryTypes } from "sequelize";

import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1000;

async function countImageMarkdownInMessages(logger: typeof Logger) {
  logger.info("Processing agent message contents");

  let imageMarkdownCount = 0;

  // Regex to match image markdown: ![anything](anything)
  const imageMarkdownRegex = /!\[.*?\]\(.*?\)/;

  const frontSecondary = getFrontReplicaDbConnection();

  const messages = await frontSecondary.query<{
    id: number;
    value: { value: string };
  }>(
    `SELECT id, value
     FROM agent_step_contents
     WHERE type = 'text_content'
     ORDER BY id DESC
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
    if (imageMarkdownRegex.test(message.value.value)) {
      imageMarkdownCount++;
    }
  }

  logger.info(
    `Processed ${messages.length} agent message contents. Found ${imageMarkdownCount} messages with image markdown components.`
  );
}

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting image markdown component count migration");

  await countImageMarkdownInMessages(logger);
});
