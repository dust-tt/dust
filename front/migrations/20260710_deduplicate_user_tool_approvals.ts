import type { Logger } from "pino";
import { Op } from "sequelize";
import { chunk } from "lodash";

import { UserToolApprovalModel } from "@app/lib/resources/storage/models/user";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";

const READ_BATCH_SIZE = 1000;
const DELETE_BATCH_SIZE = 500;

function getApprovalKey(approval: UserToolApprovalModel): string | null {
  if (!approval.argsAndValuesMd5) {
    return null;
  }

  return JSON.stringify([
    approval.userId,
    approval.mcpServerId,
    approval.toolName,
    approval.argsAndValuesMd5,
  ]);
}

async function findDuplicateApprovalIds(
  workspaceId: ModelId,
  logger: Logger
): Promise<ModelId[]> {
  const seenApprovalKeys = new Set<string>();
  const duplicateApprovalIds: ModelId[] = [];
  let lastApprovalId: ModelId | null = null;
  let scannedCount = 0;

  while (true) {
    const approvals: UserToolApprovalModel[] =
      await UserToolApprovalModel.findAll({
        attributes: [
          "id",
          "workspaceId",
          "userId",
          "mcpServerId",
          "toolName",
          "argsAndValuesMd5",
        ],
        where: {
          workspaceId,
          argsAndValuesMd5: { [Op.ne]: null },
          ...(lastApprovalId !== null
            ? { id: { [Op.gt]: lastApprovalId } }
            : {}),
        },
        order: [["id", "ASC"]],
        limit: READ_BATCH_SIZE,
      });

    if (approvals.length === 0) {
      break;
    }

    for (const approval of approvals) {
      const approvalKey = getApprovalKey(approval);
      if (!approvalKey) {
        continue;
      }

      if (seenApprovalKeys.has(approvalKey)) {
        duplicateApprovalIds.push(approval.id);
      } else {
        seenApprovalKeys.add(approvalKey);
      }
    }

    scannedCount += approvals.length;
    lastApprovalId = approvals[approvals.length - 1].id;
  }

  logger.info(
    { scannedCount, duplicateCount: duplicateApprovalIds.length },
    "Scanned scoped user tool approvals"
  );

  return duplicateApprovalIds;
}

makeScript({}, async ({ execute }, logger) => {
  let totalDeletedCount = 0;
  let totalDuplicateCount = 0;

  await runOnAllWorkspaces(async (workspace) => {
    const workspaceLogger = logger.child({ workspaceId: workspace.sId });

    while (true) {
      const duplicateApprovalIds = await findDuplicateApprovalIds(
        workspace.id,
        workspaceLogger
      );
      totalDuplicateCount += duplicateApprovalIds.length;
      if (!execute || duplicateApprovalIds.length === 0) {
        return;
      }

      for (const approvalIds of chunk(
        duplicateApprovalIds,
        DELETE_BATCH_SIZE
      )) {
        totalDeletedCount += await UserToolApprovalModel.destroy({
          where: {
            workspaceId: workspace.id,
            id: { [Op.in]: approvalIds },
          },
        });
      }
    }
  });

  logger.info(
    { execute, totalDuplicateCount, totalDeletedCount },
    execute
      ? "Finished deduplicating scoped user tool approvals"
      : "Dry run: scoped user tool approvals that would be deleted"
  );
});
