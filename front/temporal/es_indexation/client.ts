import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/es_indexation/config";
import { makeIndexUserSearchWorkflowId } from "@app/temporal/es_indexation/helpers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { indexUserSearchSignal } from "./signals";
import { indexUserSearchWorkflow } from "./workflows";

export async function launchIndexUserSearchWorkflow({
  userId,
}: {
  userId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeIndexUserSearchWorkflowId({ userId });

  try {
    await client.workflow.signalWithStart(indexUserSearchWorkflow, {
      args: [{ userId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: indexUserSearchSignal,
      signalArgs: undefined,
      memo: {
        userId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        userId,
        error: e,
      },
      "Failed starting index user workflow"
    );

    return new Err(normalizeError(e));
  }
}
