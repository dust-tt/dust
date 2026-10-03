import { config } from "@app/lib/api/cells/config";
import { makeScript } from "@app/scripts/helpers";
import { workspaceBackfillConversationDataSourcesWorkflow } from "@app/temporal/relocation/backfill_workflows";
import { RELOCATION_QUEUES_PER_CELL } from "@app/temporal/relocation/config";
import {
  CONVERSATION_BACKFILL_DEFAULT_CONCURRENCY,
  CONVERSATION_BACKFILL_MAX_CONCURRENCY,
} from "@app/temporal/relocation/lib/conversation_backfill";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import { isCellType, SUPPORTED_CELLS } from "@app/types/cell";
import { WorkflowIdReusePolicy } from "@temporalio/client";
import assert from "assert";

makeScript(
  {
    workspaceId: { type: "string", demandOption: true },
    sourceCell: {
      type: "string",
      choices: SUPPORTED_CELLS,
      demandOption: true,
    },
    destCell: { type: "string", choices: SUPPORTED_CELLS, demandOption: true },
    concurrency: {
      type: "number",
      default: CONVERSATION_BACKFILL_DEFAULT_CONCURRENCY,
    },
  },
  async (
    { workspaceId, sourceCell, destCell, concurrency, execute },
    logger
  ) => {
    assert(isCellType(sourceCell) && isCellType(destCell), "Invalid cells.");
    assert(sourceCell !== destCell, "Cells must differ.");
    assert(
      config.getCurrentCell().name === sourceCell,
      "Run from the source cell."
    );
    assert(/^[a-zA-Z0-9]+$/.test(workspaceId), "Invalid workspace ID.");
    assert(
      Number.isSafeInteger(concurrency) &&
        concurrency >= 1 &&
        concurrency <= CONVERSATION_BACKFILL_MAX_CONCURRENCY,
      "Concurrency must be between 1 and 20."
    );
    const workflowId = `workspaceBackfillConversationDataSourcesWorkflow-${workspaceId}`;
    const args = { workspaceId, sourceCell, destCell, concurrency };
    logger.info(
      { workflowId, ...args, execute },
      "Backfill uses saved manifests only. Preserve source data and coordinate customer activity."
    );
    if (!execute) {
      return;
    }
    const client = await getTemporalRelocationClient();
    await client.workflow.start(
      workspaceBackfillConversationDataSourcesWorkflow,
      {
        workflowId,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
        taskQueue: RELOCATION_QUEUES_PER_CELL[sourceCell],
        args: [args],
        memo: { workspaceId, sourceCell, destCell },
      }
    );
    logger.info(
      { workflowId },
      "Backfill coordinator started; track completion in Temporal."
    );
  }
);
