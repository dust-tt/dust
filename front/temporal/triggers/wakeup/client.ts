import type { Authenticator } from "@app/lib/auth";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/triggers/common/config";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { wakeUpWorkflow } from "./workflows";

export function makeWakeUpWorkflowId({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): string {
  return `wakeup-${workspaceId}-${wakeUpId}`;
}

export async function createWakeUpTemporal({
  auth,
  wakeUp,
}: {
  auth: Authenticator;
  wakeUp: WakeUpType;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClientForAgentNamespace();
  const owner = auth.getNonNullableWorkspace();
  const workflowId = makeWakeUpWorkflowId({
    workspaceId: owner.sId,
    wakeUpId: wakeUp.sId,
  });

  switch (wakeUp.scheduleConfig.type) {
    case "one_shot": {
      const startDelayMs = Math.max(
        0,
        wakeUp.scheduleConfig.fireAt - Date.now()
      );

      try {
        await client.workflow.start(wakeUpWorkflow, {
          args: [{ workspaceId: owner.sId, wakeUpId: wakeUp.sId }],
          taskQueue: QUEUE_NAME,
          workflowId,
          startDelay: startDelayMs,
          memo: {
            workspaceId: owner.sId,
            wakeUpId: wakeUp.sId,
          },
        });
      } catch (error) {
        // We log and error even if this is a WorkflowExecutionAlreadyStartedError, because it means
        // that the existing workflow is still running, which is unexpected (since this is a
        // one-shot wake-up).
        logger.error(
          {
            workspaceId: owner.sId,
            wakeUpId: wakeUp.sId,
            workflowId,
            error,
          },
          "Failed starting wake-up workflow."
        );

        return new Err(normalizeError(error));
      }

      return new Ok(undefined);
    }

    case "cron": {
      return new Err(new Error("Cron wake-ups are not supported yet."));
    }

    default:
      return assertNever(wakeUp.scheduleConfig);
  }
}
