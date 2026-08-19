import type { AgentConfigurationStatus } from "@app/types/assistant/agent";
import type { TriggerKind, TriggerStatus } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Business rules for the "automatically archive inactive agents" feature.
 *
 * This module is deliberately pure: no database, no Temporal, no HTTP, no Authenticator. It only
 * answers one question — "given what we know about a logical agent, is it eligible for automatic
 * archival?" — so that the manual (synchronous API) path and the nightly (Temporal) path share the
 * exact same decision and can both be tested without infrastructure.
 *
 * The rules:
 *
 * - Opt-in per workspace : no threshold configured, nothing archived. There is no default.
 * - Threshold between 2 and 366 days : a whole number of days; anything else archives nothing.
 * - Mentions are the only activity : any mention resets it, whatever became of the run it started.
 * - Creating or editing an agent is not activity : only being reached for counts. Editing in
 *   particular must not push archival back, so what counts is when the agent first appeared, not
 *   when its current version was written.
 * - An agent must predate the cutoff : one created inside the window has not existed long enough to
 *   have fallen out of use, whatever its mentions say.
 * - Inactive means last mentioned before the cutoff : never mentioned counts as inactive.
 * - Only active agents are archivable : archived, draft and pending ones are left alone.
 * - Schedules are exempt : never archive an agent a schedule still drives, whatever its frequency —
 *   including one Dust itself paused (relocation, plan downgrade), which the workspace never chose
 *   to stop.
 * - Wake-ups are not exempt : a pending wake-up does not protect an agent, and archiving cancels it.
 *
 * Archival itself goes through the existing `archiveAgentConfiguration` primitive, which owns every
 * side effect (trigger disabling, wake-up cancellation, editor group suspension, audit event).
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Archiving after a single day of inactivity is never a legitimate policy: it would archive agents
// used weekly, or an agent created over a weekend. Two days is the product-agreed floor.
export const MIN_INACTIVITY_THRESHOLD_DAYS = 2;

// A year and a leap day. Guards a typo (3650 for 365), which would silently archive nothing forever,
// and a value large enough to overflow the cutoff arithmetic into an Invalid Date.
export const MAX_INACTIVITY_THRESHOLD_DAYS = 366;

type AgentInactivityPolicyErrorType = "invalid_threshold";

export class AgentInactivityPolicyError extends Error {
  constructor(
    readonly type: AgentInactivityPolicyErrorType,
    message: string
  ) {
    super(message);
  }
}

export interface AgentInactivityCutoffInput {
  // The workspace-level threshold, owned by the workspace and configured in Governance. Always
  // explicit — there is no fallback value in this module.
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
  // The earliest version's creation, not the active row's: upgrading inserts a new row, so the
  // active row's date is the last edit, and editing must not postpone archival.
  createdAt: Date;
  // Null means never mentioned.
  lastMentionedAt: Date | null;
  status: AgentConfigurationStatus;
  // All of them. Which ones protect the agent is `doesTriggerPreventArchival`'s call.
  triggers: AgentTriggerSnapshot[];
}

/** Not a `TriggerResource`: the rules only ask what kind of automation it is and whether it runs. */
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
  // Resolved once per operation by `computeInactivityCutoffAt` and shared by every agent of that
  // operation, so the cutoff cannot drift mid-batch.
  cutoffAt: Date;
}

// Module-private: callers validate a threshold by resolving a cutoff from it, so there is one way to
// be told a policy is unusable.
function isValidInactivityThresholdDays(thresholdDays: number): boolean {
  return (
    Number.isInteger(thresholdDays) &&
    thresholdDays >= MIN_INACTIVITY_THRESHOLD_DAYS &&
    thresholdDays <= MAX_INACTIVITY_THRESHOLD_DAYS
  );
}

/**
 * The day an agent must have been inactive since to be archivable.
 *
 * A day boundary rather than an instant, because the threshold is in whole days: a nightly run at
 * 02:00 and an admin previewing at 17:00 then judge every agent identically, and truncating downwards
 * only ever grants more grace than asked for.
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

/** Only `active` agents are candidates. Drafts, pending and already-archived agents are not. */
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
 * every night.
 *
 * Protection drops only on a status the workspace itself chose. `relocating` and `downgraded` are set
 * in bulk by Dust on triggers meant to be enabled again, so reading them as "no schedule" would
 * archive every scheduled agent of a workspace mid-relocation.
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
    // Paused by Dust and not by the workspace: the schedule is expected to resume.
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
 *
 * Both branches are legitimate business outcomes, so this returns a decision rather than a
 * `Result`: "not eligible" is an answer, not a failure. Exclusions are ordered from the cheapest and
 * most decisive check to the activity comparison.
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

  // Checked before the mentions, because a young agent is protected whatever they say: one created
  // inside the window has not existed long enough to have fallen out of use.
  if (agent.createdAt.getTime() >= cutoffAt.getTime()) {
    return {
      eligible: false,
      reason: "recent_creation",
    };
  }

  // Never mentioned: nothing has ever reset inactivity, so the agent is inactive.
  if (!agent.lastMentionedAt) {
    return { eligible: true };
  }

  // Strictly before the cutoff. A mention landing exactly on the cutoff counts as recent, so a
  // threshold of N days always leaves a full N days of grace.
  if (agent.lastMentionedAt.getTime() < cutoffAt.getTime()) {
    return { eligible: true };
  }

  return {
    eligible: false,
    reason: "recent_mention",
  };
}
