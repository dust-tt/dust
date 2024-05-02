import type { ModelId } from "@dust-tt/types";
import { QueryTypes } from "sequelize";

import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillDustAppRunActions = async (execute: boolean) => {
  let actions: AgentDustAppRunAction[] = [];
  actions = await AgentDustAppRunAction.findAll({
    // @ts-expect-error agentMessageId became null during this PR. But the migration still has to run to
    // effectively update the agentMessageId.
    where: {
      agentMessageId: null,
    },
  });
  logger.info(
    {
      count: actions.length,
    },
    "Processing actions for backfilling agentMessageId"
  );
  for (const action of actions) {
    const agentMessage = await AgentMessage.findOne({
      where: {
        agentDustAppRunActionId: action.id,
      },
    });
    if (agentMessage) {
      if (execute) {
        await action.update({
          agentMessageId: agentMessage.id,
        });
        logger.info({ actionId: action.id }, "Updated agentMessageId");
      } else {
        logger.info({ actionId: action.id }, "*Would* update agentMessageId");
      }
    } else {
      logger.warn({ actionId: action.id }, "AgentMessage not found");
    }
  }

  // checking that all pairs are correct
  const errors: { id: ModelId }[] = await frontSequelize.query(
    `
    SELECT
    *
  FROM
    agent_messages am
    INNER JOIN agent_dust_app_run_actions adara ON (am."agentDustAppRunActionId" = adara.id)
  WHERE
    (
      am.id <> adara."agentMessageId"
      OR adara."agentMessageId" IS NULL
    );
  `,
    {
      type: QueryTypes.SELECT,
    }
  );
  if (errors.length > 0) {
    logger.error(
      { count: errors.length },
      "AgentMessageId not updated correctly"
    );
  } else {
    logger.info("No error found");
  }
};

makeScript({}, async ({ execute }) => {
  await backfillDustAppRunActions(execute);
});
