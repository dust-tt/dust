/* eslint-disable dust/no-raw-sql */

import { frontSequelize } from "@app/lib/resources/storage";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger: Logger) => {
  if (!execute) {
    logger.info("Dry run mode. Use --execute to apply changes.");
    return;
  }

  // Update all existing agent_step_contents to have an sId.
  const [agentStepContents] = await frontSequelize.query(
    `SELECT id FROM agent_step_contents WHERE "sId" IS NULL`
  );

  logger.info(
    `Found ${agentStepContents.length} agent step contents to update.`
  );

  for (const row of agentStepContents) {
    const sId = generateRandomModelSId();
    await frontSequelize.query(
      `UPDATE agent_step_contents SET "sId" = :sId WHERE id = :id`,
      {
        replacements: {
          sId,
          id: (row as any).id,
        },
      }
    );
  }

  logger.info("Updated all agent step contents with sId values.");

  // Make sId NOT NULL after populating values.
  await frontSequelize.query(
    `ALTER TABLE "agent_step_contents" ALTER COLUMN "sId" SET NOT NULL`
  );

  logger.info("Made sId column NOT NULL.");
});
