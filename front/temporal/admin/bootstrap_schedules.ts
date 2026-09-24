import { launchEnsureActivationSchedulesWorkflow } from "@app/temporal/activation_scheduler/client";
import {
  createOrUpdateFramesRetentionSchedule,
  launchDataRetentionWorkflow,
} from "@app/temporal/data_retention/client";
import {
  launchCodeDefinedSearchSchedule,
  launchSearchUsageSchedule,
} from "@app/temporal/es_indexation/client";
import { launchInvitationRemindersWorkflow } from "@app/temporal/invitations/client";
import { launchEnsureReinforcementSchedulesWorkflow } from "@app/temporal/reinforcement/client";
import { createRemoteMCPServersSyncSchedule } from "@app/temporal/remote_tools/client";
import { createOrUpdateWebhookCleanupSchedule } from "@app/temporal/triggers_garbage_collect/client";
import type { Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Every front-owned singleton Temporal schedule a cluster needs. Each launcher
// is idempotent (create-or-update, or unpause-and-trigger), so running this on
// an existing cluster is a no-op. Add a new singleton here the day it is added,
// so a fresh cell never misses it. The connectors singletons have their own
// bootstrap (connectors ... webcrawler start-scheduler).
const SCHEDULES: {
  name: string;
  start: () => Promise<Result<unknown, Error>>;
}[] = [
  { name: "data-retention", start: launchDataRetentionWorkflow },
  {
    name: "frames-retention",
    start: createOrUpdateFramesRetentionSchedule,
  },
  {
    name: "reinforcement-ensure-schedules",
    start: launchEnsureReinforcementSchedulesWorkflow,
  },
  {
    name: "remote-mcp-servers-sync",
    start: createRemoteMCPServersSyncSchedule,
  },
  { name: "webhook-cleanup", start: createOrUpdateWebhookCleanupSchedule },
  { name: "invitation-reminders", start: launchInvitationRemindersWorkflow },
  {
    name: "activation-ensure-schedules",
    start: launchEnsureActivationSchedulesWorkflow,
  },
  { name: "search-usage-daily", start: launchSearchUsageSchedule },
  {
    name: "search-code-defined-hourly",
    start: launchCodeDefinedSearchSchedule,
  },
];

const main = async () => {
  let failed = 0;
  for (const schedule of SCHEDULES) {
    try {
      const res = await schedule.start();
      if (res.isErr()) {
        failed++;
        console.error(
          "\x1b[31m%s\x1b[0m",
          `✗ ${schedule.name}: ${res.error.message}`
        );
      } else {
        console.log("\x1b[32m%s\x1b[0m", `✓ ${schedule.name}`);
      }
    } catch (err) {
      failed++;
      console.error(
        "\x1b[31m%s\x1b[0m",
        `✗ ${schedule.name}: ${normalizeError(err).message}`
      );
    }
  }
  if (failed > 0) {
    throw new Error(`${failed}/${SCHEDULES.length} schedules failed to start`);
  }
};

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", "All front schedules bootstrapped.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${normalizeError(err).message}`);
    process.exit(1);
  });
