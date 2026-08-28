import type { AgentConfigurationStatus } from "@app/types/assistant/agent";
import type { TriggerKind, TriggerStatus } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";

/**
 * Pure business rules for automatic archival of inactive agents: no database, no Temporal, no
 * Authenticator, so the manual and nightly paths share one decision and both stay testable without
 * infrastructure.
 */

export { ONE_DAY_MS };

export const MIN_INACTIVITY_THRESHOLD_DAYS = 2;
export const MAX_INACTIVITY_THRESHOLD_DAYS = 366;

export class AgentInactivityPolicyError extends Error {
  constructor(
    readonly type: "invalid_threshold",
    message: string
  ) {
    super(message);
  }
}

export interface AgentInactivityCutoffInput {
  // Configured in Governance. Always explicit: this module has no default.
  thresholdDays: number;
  evaluatedAt: Date;
}

export type AgentInactivityCutoffResult = Result<
  Date,
  AgentInactivityPolicyError
>;

/** One logical agent — the stable `sId`, not a configuration version. */
export interface AgentInactivitySnapshot {
  agentId: string;
  // The earliest version's date: upgrading inserts a new row, and editing must not postpone
  // archival.
  createdAt: Date;
  lastMentionedAt: Date | null;
  status: AgentConfigurationStatus;
  // Every trigger the agent has; `doesTriggerPreventArchival` picks out the ones that protect it.
  triggers: AgentTriggerSnapshot[];
}

/** The rules read only a trigger's kind and status, so they take this rather than a `TriggerResource`. */
export interface AgentTriggerSnapshot {
  kind: TriggerKind;
  status: TriggerStatus;
}

export type AgentArchivalExclusionReason =
  | "agent_not_active"
  | "active_schedule"
  | "recent_creation"
  | "recent_mention";

export type AgentArchivalEligibility =
  | { eligible: true }
  | { eligible: false; reason: AgentArchivalExclusionReason };

export interface AgentArchivalEvaluationInput {
  agent: AgentInactivitySnapshot;
  // Shared by every agent of one operation, so the cutoff cannot drift mid-batch.
  cutoffAt: Date;
}

function isValidInactivityThresholdDays(thresholdDays: number): boolean {
  return (
    Number.isInteger(thresholdDays) &&
    thresholdDays >= MIN_INACTIVITY_THRESHOLD_DAYS &&
    thresholdDays <= MAX_INACTIVITY_THRESHOLD_DAYS
  );
}

/**
 * The day an agent must have been inactive since to be archivable. Truncated to the UTC day so a
 * 02:00 nightly run and a 17:00 preview judge every agent identically, and only ever grant more
 * grace than asked for.
 */
export function computeInactivityCutoffAt({
  thresholdDays,
  evaluatedAt,
}: AgentInactivityCutoffInput): AgentInactivityCutoffResult {
  if (!isValidInactivityThresholdDays(thresholdDays)) {
    return new Err(
      new AgentInactivityPolicyError(
        "invalid_threshold",
        `Inactivity threshold must be a whole number of days between ` +
          `${MIN_INACTIVITY_THRESHOLD_DAYS} and ${MAX_INACTIVITY_THRESHOLD_DAYS} ` +
          `(got ${thresholdDays}).`
      )
    );
  }

  const cutoffAt = new Date(evaluatedAt.getTime() - thresholdDays * ONE_DAY_MS);
  cutoffAt.setUTCHours(0, 0, 0, 0);

  return new Ok(cutoffAt);
}

function isArchivableStatus(status: AgentConfigurationStatus): boolean {
  switch (status) {
    case "active":
      return true;
    case "archived":
    case "draft":
    case "pending":
    case "disabled_by_admin":
    case "disabled_missing_datasource":
    case "disabled_free_workspace":
      return false;
    default:
      return assertNever(status);
  }
}

/**
 * Only schedules protect an agent: they drive it on their own, so one nobody mentions can still run
 * every night. `relocating` and `downgraded` are set in bulk by Dust on triggers meant to be enabled
 * again, so reading them as "no schedule" would archive every scheduled agent mid-relocation.
 */
export function doesTriggerPreventArchival({
  kind,
  status,
}: AgentTriggerSnapshot): boolean {
  if (kind !== "schedule") {
    return false;
  }

  switch (status) {
    case "enabled":
    case "relocating":
    case "downgraded":
      return true;
    case "disabled":
    case "disabled_by_manager":
      return false;
    default:
      return assertNever(status);
  }
}

/**
 * Decides whether one logical agent is eligible for automatic archival, against a cutoff already
 * resolved by `computeInactivityCutoffAt`.
 */
export function evaluateAgentArchivalEligibility({
  agent,
  cutoffAt,
}: AgentArchivalEvaluationInput): AgentArchivalEligibility {
  if (!isArchivableStatus(agent.status)) {
    return {
      eligible: false,
      reason: "agent_not_active",
    };
  }

  if (agent.triggers.some(doesTriggerPreventArchival)) {
    return {
      eligible: false,
      reason: "active_schedule",
    };
  }

  // Before the mentions: a young agent has not existed long enough to have fallen out of use,
  // whatever they say.
  if (agent.createdAt.getTime() >= cutoffAt.getTime()) {
    return {
      eligible: false,
      reason: "recent_creation",
    };
  }

  // Never mentioned counts as inactive.
  if (!agent.lastMentionedAt) {
    return { eligible: true };
  }

  // Strict: a mention landing exactly on the cutoff counts as recent, so a threshold of N days
  // always leaves a full N days of grace.
  if (agent.lastMentionedAt.getTime() < cutoffAt.getTime()) {
    return { eligible: true };
  }

  // `MentionResource.listAgentsNotMentionedSince` applies the same comparison in SQL, so callers
  // reading candidates from it never see this reason. The rule stays here so this module remains the
  // one place that states what "inactive" means.
  return {
    eligible: false,
    reason: "recent_mention",
  };
}
