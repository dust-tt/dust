import { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import {
  makeTriggerScheduleId,
  parseTriggerScheduleId,
} from "@app/temporal/triggers/schedule_client";
import {
  makeWakeUpScheduleId,
  parseWakeUpScheduleId,
} from "@app/temporal/triggers/wakeup_client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Context } from "@temporalio/activity";
import type { ScheduleClient } from "@temporalio/client";
import { ScheduleNotFoundError } from "@temporalio/client";

export async function webhookCleanupActivity() {
  const workspacesToCleanup =
    await WebhookRequestResource.getWorkspacesWithTooManyRequests();

  if (workspacesToCleanup.length === 0) {
    logger.info("No workspaces with too many webhook requests to cleanup.");
    return;
  }

  for (const workspace of workspacesToCleanup) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await WebhookRequestResource.cleanUpWorkspace(auth);
    logger.info(
      { workspaceId: workspace.sId },
      "Cleaned up webhook requests for workspace."
    );
  }
}

async function deleteScheduleById(
  client: ScheduleClient,
  scheduleId: string
): Promise<boolean> {
  // Heartbeat on every delete: the per-workspace delete loops can be long on a
  // large namespace, and we must keep the activity within its heartbeatTimeout.
  // The SDK throttles heartbeats, so calling it per delete is cheap.
  Context.current().heartbeat();
  try {
    await client.getHandle(scheduleId).delete();
    logger.info({ scheduleId }, "Deleted orphaned agent schedule.");
    return true;
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      return false;
    }
    logger.error(
      { scheduleId, error: normalizeError(err) },
      "Failed to delete orphaned agent schedule."
    );
    return false;
  }
}

function addToGroup(
  groups: Map<string, string[]>,
  workspaceId: string,
  resourceId: string
): void {
  const existing = groups.get(workspaceId);
  if (existing) {
    existing.push(resourceId);
  } else {
    groups.set(workspaceId, [resourceId]);
  }
}

// Deletes Temporal schedules (both trigger `agent-schedule-*` and wake-up
// `wakeup-schedule-*` flavors) whose backing row is missing or no longer active.
// This is the backstop for the missing deletion cascade: agents, triggers and
// wake-ups have no DB foreign key to their Temporal schedules, so a failed or
// skipped cancellation would otherwise leave a schedule firing forever.
//
// Conservative by design: a schedule is deleted only when we positively confirm
// the workspace resolves and the backing trigger/wake-up is absent or terminal.
// Any transient error while fetching throws, so Temporal retries the activity
// instead of deleting live schedules.
export async function orphanedScheduleCleanupActivity() {
  const client = await getTemporalClientForAgentNamespace();
  const scheduleClient = client.schedule;

  const triggerIdsByWorkspace = new Map<string, string[]>();
  const wakeUpIdsByWorkspace = new Map<string, string[]>();

  for await (const schedule of scheduleClient.list()) {
    // Heartbeat during the scan: listing every schedule in the namespace can on
    // its own exceed the heartbeatTimeout before we reach the per-workspace
    // loop below. The SDK throttles heartbeats, so per-schedule is cheap.
    Context.current().heartbeat();

    const { scheduleId } = schedule;

    const trigger = parseTriggerScheduleId(scheduleId);
    if (trigger) {
      addToGroup(triggerIdsByWorkspace, trigger.workspaceId, trigger.triggerId);
      continue;
    }

    const wakeUp = parseWakeUpScheduleId(scheduleId);
    if (wakeUp) {
      addToGroup(wakeUpIdsByWorkspace, wakeUp.workspaceId, wakeUp.wakeUpId);
    }
  }

  const workspaceIds = new Set([
    ...triggerIdsByWorkspace.keys(),
    ...wakeUpIdsByWorkspace.keys(),
  ]);

  let deletedCount = 0;

  for (const workspaceId of workspaceIds) {
    Context.current().heartbeat();

    const triggerIds = triggerIdsByWorkspace.get(workspaceId) ?? [];
    const wakeUpIds = wakeUpIdsByWorkspace.get(workspaceId) ?? [];

    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.warn(
        {
          workspaceId,
          triggerCount: triggerIds.length,
          wakeUpCount: wakeUpIds.length,
        },
        "Workspace not found for scheduled workflows; deleting orphaned schedules."
      );
      for (const triggerId of triggerIds) {
        if (
          await deleteScheduleById(
            scheduleClient,
            makeTriggerScheduleId(workspaceId, triggerId)
          )
        ) {
          deletedCount++;
        }
      }
      for (const wakeUpId of wakeUpIds) {
        if (
          await deleteScheduleById(
            scheduleClient,
            makeWakeUpScheduleId({ workspaceId, wakeUpId })
          )
        ) {
          deletedCount++;
        }
      }
      continue;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    if (triggerIds.length > 0) {
      const triggers = await TriggerResource.fetchByIds(auth, triggerIds);
      const liveTriggerIds = new Set(
        triggers
          .filter((t) => t.status === "enabled" && t.kind === "schedule")
          .map((t) => t.sId)
      );
      for (const triggerId of triggerIds) {
        if (!liveTriggerIds.has(triggerId)) {
          if (
            await deleteScheduleById(
              scheduleClient,
              makeTriggerScheduleId(workspaceId, triggerId)
            )
          ) {
            deletedCount++;
          }
        }
      }
    }

    if (wakeUpIds.length > 0) {
      const wakeUps = await WakeUpResource.fetchByIds(auth, wakeUpIds);
      const liveWakeUpIds = new Set(
        wakeUps.filter((w) => w.status === "scheduled").map((w) => w.sId)
      );
      for (const wakeUpId of wakeUpIds) {
        if (!liveWakeUpIds.has(wakeUpId)) {
          if (
            await deleteScheduleById(
              scheduleClient,
              makeWakeUpScheduleId({ workspaceId, wakeUpId })
            )
          ) {
            deletedCount++;
          }
        }
      }
    }
  }

  logger.info(
    { deletedCount, workspaceCount: workspaceIds.size },
    "Orphaned schedule cleanup completed."
  );
}
