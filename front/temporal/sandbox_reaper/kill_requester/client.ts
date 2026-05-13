import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/sandbox_reaper/config";
import { sandboxKillRequesterWorkflow } from "@app/temporal/sandbox_reaper/kill_requester/workflows";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface LaunchSandboxKillRequesterWorkflowInput {
  baseImage: string;
  version?: string;
}

export async function launchSandboxKillRequesterWorkflow({
  baseImage,
  version,
}: LaunchSandboxKillRequesterWorkflowInput): Promise<
  Result<{ workflowId: string }, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = `sandbox-kill-requester-${baseImage}-${
    version ?? "all"
  }-${Date.now()}`;

  try {
    await client.workflow.start(sandboxKillRequesterWorkflow, {
      args: [{ baseImage, version }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: { baseImage, version: version ?? "all" },
    });
  } catch (err) {
    logger.error(
      { workflowId, baseImage, version, error: err },
      "Failed to start sandbox kill requester workflow."
    );
    return new Err(normalizeError(err));
  }

  return new Ok({ workflowId });
}
