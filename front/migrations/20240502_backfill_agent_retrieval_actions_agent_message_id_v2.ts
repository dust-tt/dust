// import type { ModelId } from "@dust-tt/types";
// import { QueryTypes } from "sequelize";
// import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
// import { AgentMessage } from "@app/lib/models/assistant/conversation";
// import { frontSequelize } from "@app/lib/resources/storage";
// import logger from "@app/logger/logger";
// import { makeScript } from "@app/scripts/helpers";
// const backRetrievalActions = async (execute: boolean) => {
//   let retrievalActions: AgentRetrievalAction[] = [];
//   retrievalActions = await AgentRetrievalAction.findAll({
//     where: {
//       agentMessageId: null,
//     },
//   });
//   logger.info(
//     {
//       count: retrievalActions.length,
//     },
//     "Processing retrieval actions for backfilling agentMessageId"
//   );
//   for (const retrievalAction of retrievalActions) {
//     const agentMessage = await AgentMessage.findOne({
//       where: {
//         agentRetrievalActionId: retrievalAction.id,
//       },
//     });
//     if (agentMessage) {
//       if (execute) {
//         await retrievalAction.update({
//           agentMessageId: agentMessage.id,
//         });
//         logger.info(
//           { retrievalActionId: retrievalAction.id },
//           "Updated agentMessageId"
//         );
//       } else {
//         logger.info(
//           { retrievalActionId: retrievalAction.id },
//           "*Would* update agentMessageId"
//         );
//       }
//     } else {
//       logger.warn(
//         { retrievalActionId: retrievalAction.id },
//         "AgentMessage not found"
//       );
//     }
//   }
//   // checking that all pairs are correct
//   const errors: { id: ModelId }[] = await frontSequelize.query(
//     `
//     SELECT
//     *
//   FROM
//     agent_messages am
//     INNER JOIN agent_retrieval_actions arc ON (am."agentRetrievalActionId" = arc.id)
//   WHERE
//     (
//       am.id <> arc."agentMessageId"
//       OR arc."agentMessageId" IS NULL
//     );
//   `,
//     {
//       type: QueryTypes.SELECT,
//     }
//   );
//   if (errors.length > 0) {
//     logger.error(
//       { count: errors.length },
//       "AgentMessageId not updated correctly"
//     );
//   } else {
//     logger.info("No error found");
//   }
// };
// makeScript({}, async ({ execute }) => {
//   await backRetrievalActions(execute);
// });
