import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";

const QUEUE_VERSION = 2;

// Agent loop workflows are partitioned across task queues (isolation domains) so one traffic
// class cannot starve another. Each queue's worker deployment is sized by infra to a QoS tier
// (replicas, cpu, memory; per-pod activity slots are hardcoded per worker):
// - schedules (high): scheduled triggers and wake-ups, i.e. time commitments.
// - interactive (high): humans waiting on an answer, in the product UI or in a chat platform
//   (Slack/Teams bots, via connectors with system keys).
// - programmatic (medium): the public API surface (integrations, automations).
// - batch (low): webhook-fired triggers and internal batch work.
// Queue names are decoupled from tiers so re-tiering a queue never migrates workflows.
export type AgentLoopQueue =
  | "schedules"
  | "interactive"
  | "programmatic"
  | "batch";

export const SCHEDULES_QUEUE_NAME = `agent-loop-schedules-queue-v${QUEUE_VERSION}`;
export const INTERACTIVE_QUEUE_NAME = `agent-loop-interactive-queue-v${QUEUE_VERSION}`;
export const PROGRAMMATIC_QUEUE_NAME = `agent-loop-programmatic-queue-v${QUEUE_VERSION}`;
export const BATCH_QUEUE_NAME = `agent-loop-batch-queue-v${QUEUE_VERSION}`;

export function getQueueName(queue: AgentLoopQueue): string {
  switch (queue) {
    case "schedules":
      return SCHEDULES_QUEUE_NAME;
    case "interactive":
      return INTERACTIVE_QUEUE_NAME;
    case "programmatic":
      return PROGRAMMATIC_QUEUE_NAME;
    case "batch":
      return BATCH_QUEUE_NAME;
    default:
      return assertNever(queue);
  }
}

// The QoS policy: which queue serves each user message origin. The origin is validated
// against the auth method when the message is posted (e.g. only system API keys can claim
// slack/teams origins), so it is trustworthy as a routing key.
export function getQueueForUserMessageOrigin(
  origin: UserMessageOrigin
): AgentLoopQueue {
  switch (origin) {
    case "api":
    case "cli":
    case "cli_programmatic":
    case "email":
    case "excel":
    case "extension":
    case "gsheet":
    case "make":
    case "n8n":
    case "powerpoint":
    case "raycast":
    case "zapier":
    case "zendesk":
      return "programmatic";
    case "agent_sidekick":
    case "onboarding_conversation":
    case "project_kickoff":
    case "reinforced_skill_notification":
    case "slack":
    case "slack_workflow":
    case "teams":
    case "web":
      return "interactive";
    case "triggered":
    case "wakeup":
      return "schedules";
    case "triggered_programmatic":
    case "reinforcement":
    case "system_activation":
    case "transcript":
      return "batch";
    default:
      // Origins are persisted: during a rolling deploy an older pod can read an origin value
      // introduced by a newer one. Unknown origins degrade to batch, away from the pools
      // serving humans.
      assertNeverAndIgnore(origin);
      return "batch";
  }
}

// Attempt after which run_model surfaces a retryable model error to the user instead of throwing
// for a Temporal retry (see shouldSurfaceModelError).
export const RUN_MODEL_MAX_RETRIES = 5;

// Leave room for our code to surface a retryable agent error before Temporal enforces StartToClose.
export const RUN_MODEL_ACTIVITY_TIMEOUT_SAFETY_MARGIN_MS = 1 * 60 * 1000;

export const TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS = 60 * 1000;
export const MODEL_ACTIVITY_HEARTBEAT_TIMEOUT_MS = 60 * 1000;

// The worker's maxHeartbeatThrottleInterval: the SDK sends at most one heartbeat to the server
// per interval, so a faster app-side cadence buys nothing. The activity cadences below derive
// from it so the values cannot drift apart.
export const HEARTBEAT_THROTTLE_INTERVAL_MS = 20 * 1000;

// Heartbeat cadence for the whole model activity. Its setup phase (agent data loading, MCP
// tools listing, conversation rendering) can stall past the heartbeat timeout, e.g. a hung MCP
// server's tools/list call times out after 60s, exactly the heartbeat timeout.
export const MODEL_ACTIVITY_HEARTBEAT_INTERVAL_MS =
  HEARTBEAT_THROTTLE_INTERVAL_MS;

// Heartbeat cadence for the whole tool activity. Phases outside the MCP call loop (action state
// transitions, input handling, MCP server connection, event publication) are DB/network-bound and
// can stall past the heartbeat timeout under contention.
export const TOOL_ACTIVITY_HEARTBEAT_INTERVAL_MS =
  HEARTBEAT_THROTTLE_INTERVAL_MS;

// Heartbeat cadence while tool result processing runs (file handling can take minutes): fire
// comfortably within the heartbeat timeout.
const TOOL_RESULT_PROCESSING_HEARTBEAT_TIMEOUT_MARGIN_MS = 5 * 1000;
export const TOOL_RESULT_PROCESSING_HEARTBEAT_INTERVAL_MS =
  TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS -
  TOOL_RESULT_PROCESSING_HEARTBEAT_TIMEOUT_MARGIN_MS;

// Heartbeat cadence while the tool activity's DB-bound setup (auth + conversation + action
// fetches) runs. Setup normally completes in well under a second, so a firing means the fetch
// phase is stalling (DB contention): the log emitted alongside each firing is monitored in
// Datadog.
export const TOOL_SETUP_HEARTBEAT_INTERVAL_MS = HEARTBEAT_THROTTLE_INTERVAL_MS;
