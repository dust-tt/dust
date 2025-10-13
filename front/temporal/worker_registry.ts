import { runPokeWorker } from "@app/poke/temporal/worker";
import { runAgentLoopWorker } from "@app/temporal/agent_loop/worker";
import { runAgentScheduleWorker } from "@app/temporal/agent_schedule/worker";
import { runDataRetentionWorker } from "@app/temporal/data_retention/worker";
import { runHardDeleteWorker } from "@app/temporal/hard_delete/worker";
import { runLabsTranscriptsWorker } from "@app/temporal/labs/transcripts/worker";
import { runMentionsCountWorker } from "@app/temporal/mentions_count_queue/worker";
import { runPermissionsWorker } from "@app/temporal/permissions_queue/worker";
import { runProductionChecksWorker } from "@app/temporal/production_checks/worker";
import { runRelocationWorker } from "@app/temporal/relocation/worker";
import { runRemoteToolsSyncWorker } from "@app/temporal/remote_tools/worker";
import { runScrubWorkspaceQueueWorker } from "@app/temporal/scrub_workspace/worker";
import {
  runTrackerNotificationWorker,
  runTrackerWorker,
} from "@app/temporal/tracker/worker";
import { runUpsertQueueWorker } from "@app/temporal/upsert_queue/worker";
import { runUpsertTableQueueWorker } from "@app/temporal/upsert_tables/worker";
import { runUpdateWorkspaceUsageWorker } from "@app/temporal/usage_queue/worker";
import { runWorkOSEventsWorker } from "@app/temporal/workos_events_queue/worker";

export type WorkerName =
  | "agent_loop"
  | "agent_schedule"
  | "data_retention"
  | "document_tracker"
  | "hard_delete"
  | "labs"
  | "mentions_count"
  | "permissions_queue"
  | "poke"
  | "production_checks"
  | "relocation"
  | "remote_tools_sync"
  | "scrub_workspace_queue"
  | "tracker_notification"
  | "update_workspace_usage"
  | "upsert_queue"
  | "upsert_table_queue"
  | "workos_events_queue";

export const workerFunctions: Record<WorkerName, () => Promise<void>> = {
  agent_loop: runAgentLoopWorker,
  agent_schedule: runAgentScheduleWorker,
  data_retention: runDataRetentionWorker,
  document_tracker: runTrackerWorker,
  hard_delete: runHardDeleteWorker,
  labs: runLabsTranscriptsWorker,
  mentions_count: runMentionsCountWorker,
  permissions_queue: runPermissionsWorker,
  poke: runPokeWorker,
  production_checks: runProductionChecksWorker,
  relocation: runRelocationWorker,
  remote_tools_sync: runRemoteToolsSyncWorker,
  scrub_workspace_queue: runScrubWorkspaceQueueWorker,
  tracker_notification: runTrackerNotificationWorker,
  update_workspace_usage: runUpdateWorkspaceUsageWorker,
  upsert_queue: runUpsertQueueWorker,
  upsert_table_queue: runUpsertTableQueueWorker,
  workos_events_queue: runWorkOSEventsWorker,
};

export const ALL_WORKERS = Object.keys(workerFunctions);
export const ALL_WORKERS_BUT_RELOCATION = Object.keys(workerFunctions).filter(
  (k) => k !== "relocation"
);
