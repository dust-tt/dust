import { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import { makeScript } from "@app/scripts/helpers";
import {
  makeTriggerScheduleId,
  parseTriggerScheduleId,
} from "@app/temporal/triggers/schedule_client";
import {
  makeWakeUpScheduleId,
  parseWakeUpScheduleId,
} from "@app/temporal/triggers/wakeup_client";
import { ScheduleNotFoundError } from "@temporalio/client";

/**
 * Deletes orphaned agent Temporal schedules: trigger `agent-schedule-*` and
 * wake-up `wakeup-schedule-*` schedules whose backing trigger/wake-up row is
 * missing or no longer active. This is the operator counterpart of the
 * orphanedScheduleCleanupActivity reconciler, scoped to a single workspace and
 * dry-run by default.
 */
makeScript(
  {
    workspaceId: {
      type: "string",
      describe:
        "The sId of the workspace to scope the cleanup to (required to avoid a global sweep).",
      demandOption: true,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const client = await getTemporalClientForAgentNamespace();
    const scheduleClient = client.schedule;

    const triggerIds: string[] = [];
    const wakeUpIds: string[] = [];

    for await (const schedule of scheduleClient.list()) {
      const { scheduleId } = schedule;

      const trigger = parseTriggerScheduleId(scheduleId);
      if (trigger && trigger.workspaceId === workspaceId) {
        triggerIds.push(trigger.triggerId);
        continue;
      }

      const wakeUp = parseWakeUpScheduleId(scheduleId);
      if (wakeUp && wakeUp.workspaceId === workspaceId) {
        wakeUpIds.push(wakeUp.wakeUpId);
      }
    }

    logger.info(
      {
        workspaceId,
        triggerCount: triggerIds.length,
        wakeUpCount: wakeUpIds.length,
      },
      "Found agent schedules for workspace."
    );

    const orphanedScheduleIds: string[] = [];

    if (triggerIds.length > 0) {
      const triggers = await TriggerResource.fetchByIds(auth, triggerIds);
      const liveTriggerIds = new Set(
        triggers
          .filter((t) => t.status === "enabled" && t.kind === "schedule")
          .map((t) => t.sId)
      );
      for (const triggerId of triggerIds) {
        if (!liveTriggerIds.has(triggerId)) {
          orphanedScheduleIds.push(
            makeTriggerScheduleId(workspaceId, triggerId)
          );
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
          orphanedScheduleIds.push(
            makeWakeUpScheduleId({ workspaceId, wakeUpId })
          );
        }
      }
    }

    if (orphanedScheduleIds.length === 0) {
      logger.info({ workspaceId }, "No orphaned schedules found.");
      return;
    }

    logger.info(
      { workspaceId, orphanedCount: orphanedScheduleIds.length },
      "Found orphaned schedules."
    );

    let deletedCount = 0;
    for (const scheduleId of orphanedScheduleIds) {
      if (!execute) {
        logger.info(
          { scheduleId },
          "Would delete orphaned schedule (dry run)."
        );
        continue;
      }
      try {
        await scheduleClient.getHandle(scheduleId).delete();
        logger.info({ scheduleId }, "Deleted orphaned schedule.");
        deletedCount++;
      } catch (err) {
        if (err instanceof ScheduleNotFoundError) {
          continue;
        }
        logger.error(
          { scheduleId, err },
          "Failed to delete orphaned schedule."
        );
      }
    }

    logger.info(
      { workspaceId, deletedCount, orphanedCount: orphanedScheduleIds.length },
      execute ? "Done deleting orphaned schedules." : "Dry run completed."
    );
  }
);
