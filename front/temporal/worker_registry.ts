import { runPokeWorker } from "@app/poke/temporal/worker";
import { runAgentLoopWorker } from "@app/temporal/agent_loop/worker";
import { runAnalyticsWorker } from "@app/temporal/analytics_queue/worker";
import { runCreditAlertsWorker } from "@app/temporal/credit_alerts/worker";
import { runDataRetentionWorker } from "@app/temporal/data_retention/worker";
import { runESIndexationQueueWorker } from "@app/temporal/es_indexation/worker";
import { runHardDeleteWorker } from "@app/temporal/hard_delete/worker";
import { runLabsTranscriptsWorker } from "@app/temporal/labs/transcripts/worker";
import { runMentionsCountWorker } from "@app/temporal/mentions_count_queue/worker";
import { runMentionsQueueWorker } from "@app/temporal/mentions_queue/worker";
import { runNotificationsQueueWorker } from "@app/temporal/notifications_queue/worker";
import { runProductionChecksWorker } from "@app/temporal/production_checks/worker";
import { runRelocationWorker } from "@app/temporal/relocation/worker";
import { runRemoteToolsSyncWorker } from "@app/temporal/remote_tools/worker";
import { runScrubWorkspaceQueueWorker } from "@app/temporal/scrub_workspace/worker";
import {
  runTrackerNotificationWorker,
  runTrackerWorker,
} from "@app/temporal/tracker/worker";
import { runAgentTriggerWorker } from "@app/temporal/triggers/common/worker";
import { runAgentTriggerWebhookWorker } from "@app/temporal/triggers/webhook/worker";
import { runUpsertQueueWorker } from "@app/temporal/upsert_queue/worker";
import { runUpsertTableQueueWorker } from "@app/temporal/upsert_tables/worker";
import { runUpdateWorkspaceUsageWorker } from "@app/temporal/usage_queue/worker";
import { runWorkOSEventsWorker } from "@app/temporal/workos_events_queue/worker";

export type WorkerName =
  | "agent_loop"
  | "agent_schedule"
  | "agent_trigger_webhook"
  | "analytics_queue"
  | "credit_alerts"
  | "data_retention"
  | "document_tracker"
  | "es_indexation_queue"
  | "hard_delete"
  | "labs"
  | "mentions_count"
  | "mentions_queue"
  | "notifications_queue"
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
  agent_schedule: runAgentTriggerWorker,
  agent_trigger_webhook: runAgentTriggerWebhookWorker,
  analytics_queue: runAnalyticsWorker,
  credit_alerts: runCreditAlertsWorker,
  data_retention: runDataRetentionWorker,
  document_tracker: runTrackerWorker,
  hard_delete: runHardDeleteWorker,
  labs: runLabsTranscriptsWorker,
  mentions_count: runMentionsCountWorker,
  mentions_queue: runMentionsQueueWorker,
  notifications_queue: runNotificationsQueueWorker,
  poke: runPokeWorker,
  production_checks: runProductionChecksWorker,
  relocation: runRelocationWorker,
  remote_tools_sync: runRemoteToolsSyncWorker,
  scrub_workspace_queue: runScrubWorkspaceQueueWorker,
  tracker_notification: runTrackerNotificationWorker,
  update_workspace_usage: runUpdateWorkspaceUsageWorker,
  upsert_queue: runUpsertQueueWorker,
  upsert_table_queue: runUpsertTableQueueWorker,
  es_indexation_queue: runESIndexationQueueWorker,
  workos_events_queue: runWorkOSEventsWorker,
};

export const ALL_WORKERS = Object.keys(workerFunctions);
export const ALL_WORKERS_BUT_RELOCATION = Object.keys(workerFunctions).filter(
  (k) => k !== "relocation"
);
