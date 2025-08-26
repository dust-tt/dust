// import type { Logger } from "pino";
// import type { WhereOptions } from "sequelize";
// import { Op } from "sequelize";
//
// import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
// import { makeScript } from "@app/scripts/helpers";
//
// const BATCH_SIZE = 2048;
//
// // There are 3 possible final states: errored, succeeded, denied.
// // succeeded is the default (99.1% of actions), we backfill errored using the `isError` column
// // and denied using the `executionState` column.
//
// const TARGET_STATUSES = [
//   "errored",
//   "denied",
//   "succeeded",
//   "blocked_validation_required",
// ] as const;
//
// type TargetStatus = (typeof TARGET_STATUSES)[number];
//
// function getWhereClause({
//   lastId,
//   targetStatus,
// }: {
//   lastId: number;
//   targetStatus: TargetStatus;
// }): WhereOptions<AgentMCPAction> {
//   switch (targetStatus) {
//     case "errored":
//       return {
//         id: { [Op.gt]: lastId },
//         isError: true,
//       };
//     case "denied":
//       return {
//         id: { [Op.gt]: lastId },
//         executionState: "denied",
//       };
//     case "succeeded":
//       return {
//         id: { [Op.gt]: lastId },
//         status: "running",
//       };
//     case "blocked_validation_required":
//       return {
//         id: { [Op.gt]: lastId },
//         status: "blocked_pending_validation",
//       };
//   }
// }
// async function getNextBatch({
//   lastId,
//   targetStatus,
// }: {
//   lastId: number;
//   targetStatus: TargetStatus;
// }) {
//   return AgentMCPAction.findAll({
//     where: getWhereClause({ lastId, targetStatus }),
//     order: [["id", "ASC"]],
//     limit: BATCH_SIZE,
//   });
// }
//
// async function backfillActions(
//   { targetStatus, execute }: { targetStatus: TargetStatus; execute: boolean },
//   logger: Logger
// ) {
//   let lastId = 0;
//   let hasMore = true;
//   do {
//     const mcpActions = await getNextBatch({ lastId, targetStatus });
//     logger.info(
//       { lastId, targetStatus },
//       `Processing ${mcpActions.length} actions`
//     );
//
//     if (execute) {
//       await AgentMCPAction.update(
//         { status: targetStatus },
//         {
//           where: {
//             id: {
//               [Op.in]: mcpActions.map((a) => a.id),
//             },
//           },
//         }
//       );
//       logger.info(
//         { lastId, targetStatus },
//         `Updated ${mcpActions.length} actions`
//       );
//     } else {
//       logger.info(
//         { lastId, targetStatus },
//         `Would update ${mcpActions.length} actions`
//       );
//     }
//
//     lastId = mcpActions[mcpActions.length - 1].id;
//     hasMore = mcpActions.length === BATCH_SIZE;
//   } while (hasMore);
// }
//
// makeScript({}, async ({ execute }, logger) => {
//   for (const targetStatus of TARGET_STATUSES) {
//     logger.info(`Starting backfill of ${targetStatus} actions`);
//     await backfillActions({ targetStatus, execute }, logger);
//     logger.info(`Completed backfill of ${targetStatus} actions`);
//   }
// });
