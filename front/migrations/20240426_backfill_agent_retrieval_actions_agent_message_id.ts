// import type { ModelId } from "@app/types";
// import { QueryTypes } from "sequelize";
//
// import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
// import { AgentMessage } from "@app/lib/models/assistant/conversation";
// import { frontSequelize } from "@app/lib/resources/storage";
// import logger from "@app/logger/logger";
// import { makeScript } from "@app/scripts/helpers";
//
// const backRetrievalActions = async (execute: boolean) => {
//   let retrievalActions: AgentRetrievalAction[] = [];
//   do {
//     retrievalActions = await AgentRetrievalAction.findAll({
//       where: {
//         agentMessageId: null,
//       },
//       limit: 200,
//     });
//     logger.info(
//       {
//         count: retrievalActions.length,
//       },
//       "Processing retrieval actions for backfilling agentMessageId"
//     );
//     for (const retrievalAction of retrievalActions) {
//       const agentMessage = await AgentMessage.findOne({
//         where: {
//           agentRetrievalActionId: retrievalAction.id,
//         },
//       });
//       if (agentMessage) {
//         if (execute) {
//           await retrievalAction.update({
//             agentMessageId: agentMessage.id,
//           });
//           logger.info(
//             { retrievalActionId: retrievalAction.id },
//             "Updated agentMessageId"
//           );
//         } else {
//           logger.info(
//             { retrievalActionId: retrievalAction.id },
//             "*Would* update agentMessageId"
//           );
//         }
//       } else {
//         logger.warn(
//           { retrievalActionId: retrievalAction.id },
//           "AgentMessage not found"
//         );
//       }
//     }
//   } while (retrievalActions.length > 0 && execute);
//
//   // checking that all pairs are correct
//   const errors: { id: ModelId }[] = await frontSequelize.query(
//     `
//       SELECT am.id from agent_messages am
//       INNER JOIN agent_retrieval_actions arc ON (am."agentRetrievalActionId" = arc.id)
//       WHERE arc."agentMessageId" <> am.id
//   `,
//     {
//       type: QueryTypes.SELECT,
//     }
//   );
//   if (errors.length > 0) {
//     logger.error(
//       { count: errors.length, errors },
//       "AgentMessageId not updated correctly"
//     );
//   } else {
//     logger.info("No error found");
//   }
// };
//
// makeScript({}, async ({ execute }) => {
//   await backRetrievalActions(execute);
// });
