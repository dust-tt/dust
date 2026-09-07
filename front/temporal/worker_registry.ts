import { runPokeWorker } from "@app/poke/temporal/worker";
import { runActivationSchedulerWorker } from "@app/temporal/activation_scheduler/worker";
import { runAgentInactivityWorker } from "@app/temporal/agent_inactivity/worker";
import {
  runAgentLoopBatchWorker,
  runAgentLoopInteractiveWorker,
  runAgentLoopProgrammaticWorker,
  runAgentLoopSchedulesWorker,
} from "@app/temporal/agent_loop/worker";
import { runAnalyticsWorker } from "@app/temporal/analytics_queue/worker";
import { runConversationForkQueueWorker } from "@app/temporal/conversation_fork_queue/worker";
import { runCreditAlertsWorker } from "@app/temporal/credit_alerts/worker";
import { runDataRetentionWorker } from "@app/temporal/data_retention/worker";
import { runESIndexationQueueWorker } from "@app/temporal/es_indexation/worker";
import { runHardDeleteWorker } from "@app/temporal/hard_delete/worker";
import { runInvitationsWorker } from "@app/temporal/invitations/worker";
import { runLabsTranscriptsWorker } from "@app/temporal/labs/transcripts/worker";
import { runMentionsCountWorker } from "@app/temporal/mentions_count_queue/worker";
import { runMentionsQueueWorker } from "@app/temporal/mentions_queue/worker";
import { runMetronomeEventsWorker } from "@app/temporal/metronome_events_queue/worker";
import { runModelHealthWorker } from "@app/temporal/model_health/worker";
import { runNotificationsQueueWorker } from "@app/temporal/notifications_queue/worker";
import { runProductionChecksWorker } from "@app/temporal/production_checks/worker";
import { runReinforcementWorker } from "@app/temporal/reinforcement/worker";
import { runRelocationWorker } from "@app/temporal/relocation/worker";
import { runRemoteToolsSyncWorker } from "@app/temporal/remote_tools/worker";
import { runSandboxFunctionsWorker } from "@app/temporal/sandbox_functions/worker";
import { runSandboxReaperWorker } from "@app/temporal/sandbox_reaper/worker";
import { runScrubWorkspaceQueueWorker } from "@app/temporal/scrub_workspace/worker";
import { runAgentTriggerWorker } from "@app/temporal/triggers/worker";
import { runAgentTriggerWebhookWorker } from "@app/temporal/triggers_garbage_collect/worker";
import { runUpsertQueueWorker } from "@app/temporal/upsert_queue/worker";
import { runUpsertTableQueueWorker } from "@app/temporal/upsert_tables/worker";
import { runUpdateWorkspaceUsageWorker } from "@app/temporal/usage_queue/worker";
import { runWorkOSEventsWorker } from "@app/temporal/workos_events_queue/worker";

export type WorkerName =
  | "activation_scheduler"
  | "agent_inactivity"
  | "agent_loop_batch"
  | "agent_loop_interactive"
  | "agent_loop_programmatic"
  | "agent_loop_schedules"
  | "agent_schedule"
  | "agent_trigger_webhook"
  | "analytics_queue"
  | "conversation_fork_queue"
  | "credit_alerts"
  | "data_retention"
  | "es_indexation_queue"
  | "hard_delete"
  | "labs"
  | "invitations"
  | "mentions_count"
  | "mentions_queue"
  | "metronome_events_queue"
  | "model_health"
  | "notifications_queue"
  | "poke"
  | "production_checks"
  | "reinforcement"
  | "relocation"
  | "sandbox_functions"
  | "sandbox_reaper"
  | "remote_tools_sync"
  | "scrub_workspace_queue"
  | "update_workspace_usage"
  | "upsert_queue"
  | "upsert_table_queue"
  | "workos_events_queue";

export const workerFunctions: Record<WorkerName, () => Promise<void>> = {
  activation_scheduler: runActivationSchedulerWorker,
  agent_inactivity: runAgentInactivityWorker,
  agent_loop_batch: runAgentLoopBatchWorker,
  agent_loop_interactive: runAgentLoopInteractiveWorker,
  agent_loop_programmatic: runAgentLoopProgrammaticWorker,
  agent_loop_schedules: runAgentLoopSchedulesWorker,
  agent_schedule: runAgentTriggerWorker,
  agent_trigger_webhook: runAgentTriggerWebhookWorker,
  analytics_queue: runAnalyticsWorker,
  conversation_fork_queue: runConversationForkQueueWorker,
  credit_alerts: runCreditAlertsWorker,
  data_retention: runDataRetentionWorker,
  hard_delete: runHardDeleteWorker,
  labs: runLabsTranscriptsWorker,
  invitations: runInvitationsWorker,
  mentions_count: runMentionsCountWorker,
  mentions_queue: runMentionsQueueWorker,
  metronome_events_queue: runMetronomeEventsWorker,
  model_health: runModelHealthWorker,
  notifications_queue: runNotificationsQueueWorker,
  poke: runPokeWorker,
  production_checks: runProductionChecksWorker,
  reinforcement: runReinforcementWorker,
  relocation: runRelocationWorker,
  sandbox_functions: runSandboxFunctionsWorker,
  sandbox_reaper: runSandboxReaperWorker,
  remote_tools_sync: runRemoteToolsSyncWorker,
  scrub_workspace_queue: runScrubWorkspaceQueueWorker,
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
