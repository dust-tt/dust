import type { ModelId } from "@dust-tt/types";
import { QueryTypes } from "sequelize";

import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillTableQueryActions = async (execute: boolean) => {
  let actions: AgentTablesQueryAction[] = [];
  actions = await AgentTablesQueryAction.findAll({
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
        agentTablesQueryActionId: action.id,
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
    INNER JOIN agent_tables_query_actions atqa ON (am."agentTablesQueryActionId" = atqa.id)
  WHERE
    (
      am.id <> atqa."agentMessageId"
      OR atqa."agentMessageId" IS NULL
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
  await backfillTableQueryActions(execute);
});
