import { config as cellConfig } from "@app/lib/api/cells/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type {
  ConversationBackfillScope,
  ConversationBackfillSourceState,
} from "@app/temporal/relocation/lib/conversation_backfill";
import { sameCoreDataSource } from "@app/temporal/relocation/lib/conversation_backfill";
import { ApplicationFailure } from "@temporalio/common";
import assert from "assert";
import { Op } from "sequelize";

/**
 * @cc [owner:Nils-Fedrigo,label:security] backfill-destination-preflight
 * Every destination row MUST belong to the intended workspace and conversation.
 * A source without a known execution MUST still point to the manifest's original
 * Core IDs. Changed IDs alone MUST NOT be interpreted as a completed backfill.
 */
export async function verifyConversationBackfillDestination({
  states,
  ...scope
}: ConversationBackfillScope & {
  states: ConversationBackfillSourceState[];
}): Promise<void> {
  assert(cellConfig.getCurrentCell().name === scope.destCell);
  const workspace = await getWorkspaceInfos(scope.workspaceId);
  assert(workspace, "Destination workspace not found.");
  const rows = await DataSourceModel.findAll({
    where: {
      workspaceId: workspace.id,
      id: { [Op.in]: states.map(({ source }) => source.id) },
    },
  });
  for (const { source, status } of states) {
    const row = rows.find((candidate) => candidate.id === source.id);
    if (!row || row.conversationId !== source.conversationId) {
      throw ApplicationFailure.nonRetryable(
        `Destination source ${source.id} is missing, deleted, or has a different conversation.`
      );
    }
    const unchanged = sameCoreDataSource(row, source);
    if (
      (status === "NOT_STARTED" && !unchanged) ||
      (status === "COMPLETED" && unchanged)
    ) {
      throw ApplicationFailure.nonRetryable(
        `Destination Core IDs disagree with ${status} execution for source ${source.id}.`
      );
    }
  }
}
