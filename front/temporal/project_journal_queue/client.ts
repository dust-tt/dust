import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { Authenticator } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/project_journal_queue/config";
import { generateProjectJournalEntryWorkflow } from "@app/temporal/project_journal_queue/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function makeProjectJournalWorkflowId({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): string {
  return `project-journal-${workspaceId}-${spaceId}`;
}

export async function launchProjectJournalGenerationWorkflow({
  auth,
  spaceId,
}: {
  auth: Authenticator;
  spaceId: string;
}): Promise<Result<undefined, Error>> {
  const authType = auth.toJSON();
  const workspace = auth.getNonNullableWorkspace();

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeProjectJournalWorkflowId({
    workspaceId: workspace.sId,
    spaceId,
  });

  try {
    await client.workflow.start(generateProjectJournalEntryWorkflow, {
      args: [authType, { spaceId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        spaceId,
        workspaceId: workspace.sId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          spaceId,
          error: e,
        },
        "Failed starting project journal generation workflow"
      );
    } else {
      logger.info(
        {
          workflowId,
          spaceId,
        },
        "Project journal generation workflow already running"
      );
    }

    return new Err(normalizeError(e));
  }
}
