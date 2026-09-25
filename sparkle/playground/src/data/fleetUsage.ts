// Usage segmentation for the fleet views.
//
// Mirrors front's `USAGE_ORIGINS_CLASSIFICATION`. The important nuance: being
// automated does not make an origin programmatic. A trigger or a wake-up runs
// on a schedule, but it runs a human's configured intent for a human audience,
// so it counts as human usage. "Programmatic" is a billing / usage-mode call —
// it covers API-driven and high-volume integration traffic (`api`, `zapier`,
// `n8n`, `make`, the spreadsheet add-ins, `slack_workflow`, and the explicitly
// programmatic variants of CLI and triggers).

export type UsageOrigin =
  | "api"
  | "cli"
  | "cli_programmatic"
  | "email"
  | "excel"
  | "extension"
  | "gsheet"
  | "make"
  | "n8n"
  | "powerpoint"
  | "raycast"
  | "slack"
  | "slack_workflow"
  | "teams"
  | "transcript"
  | "triggered"
  | "triggered_programmatic"
  | "wakeup"
  | "web"
  | "zapier"
  | "zendesk"
  | "reinforcement";

export const USAGE_ORIGINS_CLASSIFICATION: Record<
  UsageOrigin,
  "programmatic" | "user"
> = {
  api: "programmatic",
  cli: "user",
  cli_programmatic: "programmatic",
  email: "user",
  excel: "programmatic",
  extension: "user",
  gsheet: "programmatic",
  make: "programmatic",
  n8n: "programmatic",
  powerpoint: "programmatic",
  raycast: "user",
  slack: "user",
  slack_workflow: "programmatic",
  teams: "user",
  transcript: "user",
  triggered: "user",
  triggered_programmatic: "programmatic",
  wakeup: "user",
  web: "user",
  zapier: "programmatic",
  zendesk: "user",
  reinforcement: "programmatic",
};

export const USER_USAGE_ORIGINS = (
  Object.keys(USAGE_ORIGINS_CLASSIFICATION) as UsageOrigin[]
).filter((origin) => USAGE_ORIGINS_CLASSIFICATION[origin] === "user");

export const PROGRAMMATIC_USAGE_ORIGINS = (
  Object.keys(USAGE_ORIGINS_CLASSIFICATION) as UsageOrigin[]
).filter((origin) => USAGE_ORIGINS_CLASSIFICATION[origin] === "programmatic");

export const USAGE_ORIGIN_LABELS: Record<UsageOrigin, string> = {
  api: "API",
  cli: "CLI",
  cli_programmatic: "CLI (programmatic)",
  email: "Email",
  excel: "Excel add-in",
  extension: "Browser extension",
  gsheet: "Google Sheets add-in",
  make: "Make",
  n8n: "n8n",
  powerpoint: "PowerPoint add-in",
  raycast: "Raycast",
  slack: "Slack",
  slack_workflow: "Slack workflow",
  teams: "Teams",
  transcript: "Transcript",
  triggered: "Trigger",
  triggered_programmatic: "Trigger (programmatic)",
  wakeup: "Wake-up",
  web: "Web",
  zapier: "Zapier",
  zendesk: "Zendesk",
  reinforcement: "Reinforcement",
};

export const USAGE_PERIOD_DAYS = 30;
export const USAGE_PERIOD_SEC = USAGE_PERIOD_DAYS * 24 * 60 * 60;

export interface FleetUsage {
  // Messages in human-initiated conversations over the period. Primary metric
  // and sort key.
  human: number;
  // API-driven / high-volume integration traffic over the period.
  programmatic: number;
  // Runs where this agent (or the agent carrying this skill) was invoked by
  // another agent — a dependency signal, not a popularity signal.
  agentToAgent: number;
  // The programmatic origins that actually produced traffic, most used first.
  programmaticOrigins: UsageOrigin[];
  // Last use, any origin — what the tooltip shows.
  lastUsedAt: number | null;
  // Last human use. Separate from `lastUsedAt` on purpose: an agent driven
  // only by an API integration is "not used by anyone" for triage even though
  // it was hit five minutes ago.
  lastHumanUsedAt: number | null;
  timePeriodSec: number;
}

export const EMPTY_FLEET_USAGE: FleetUsage = {
  human: 0,
  programmatic: 0,
  agentToAgent: 0,
  programmaticOrigins: [],
  lastUsedAt: null,
  lastHumanUsedAt: null,
  timePeriodSec: USAGE_PERIOD_SEC,
};

export function hasSecondaryUsage(usage: FleetUsage): boolean {
  return usage.programmatic > 0 || usage.agentToAgent > 0;
}

/** Total across every origin — used for "never used" checks, never displayed. */
export function totalUsage(usage: FleetUsage): number {
  return usage.human + usage.programmatic + usage.agentToAgent;
}

/**
 * Builds a coherent usage record around a known human count. Deliberately
 * generates cases where programmatic traffic dwarfs human traffic, and cases
 * where an item looks unused but is called by other agents — those are the two
 * situations the segmentation exists to surface.
 */
export function makeFleetUsage(
  random: () => number,
  {
    human,
    nowMs,
    // Items that are structurally API-facing (integrations, data extraction)
    // get programmatic traffic far more often.
    programmaticBias = 0,
    // Items called as sub-agents / through skills.
    dependencyBias = 0,
  }: {
    human: number;
    nowMs: number;
    programmaticBias?: number;
    dependencyBias?: number;
  }
): FleetUsage {
  const hasProgrammatic = random() < 0.22 + programmaticBias;
  const programmatic = hasProgrammatic
    ? Math.max(1, Math.floor(random() * 3200))
    : 0;

  const programmaticOrigins: UsageOrigin[] = [];
  if (hasProgrammatic) {
    const candidates = [...PROGRAMMATIC_USAGE_ORIGINS];
    const count = 1 + Math.floor(random() * 2);
    while (programmaticOrigins.length < count && candidates.length > 0) {
      const [origin] = candidates.splice(
        Math.floor(random() * candidates.length),
        1
      );
      programmaticOrigins.push(origin);
    }
  }

  const agentToAgent =
    random() < 0.18 + dependencyBias
      ? Math.max(1, Math.floor(random() * 900))
      : 0;

  const dayMs = 24 * 60 * 60 * 1000;

  const lastHumanUsedAt =
    human > 0
      ? // Inside the window, weighted towards recent.
        nowMs - Math.floor(random() ** 2 * USAGE_PERIOD_DAYS * dayMs)
      : // No human message in the window: either never talked to, or last
        // talked to somewhere between a month and a year and a half ago.
        random() < 0.35
        ? null
        : nowMs - Math.floor((USAGE_PERIOD_DAYS + random() * 500) * dayMs);

  const lastAutomatedUsedAt =
    programmatic > 0 || agentToAgent > 0
      ? nowMs - Math.floor(random() ** 2 * USAGE_PERIOD_DAYS * dayMs)
      : null;

  const lastUsedAt =
    lastHumanUsedAt === null && lastAutomatedUsedAt === null
      ? null
      : Math.max(lastHumanUsedAt ?? 0, lastAutomatedUsedAt ?? 0);

  return {
    human,
    programmatic,
    agentToAgent,
    programmaticOrigins,
    lastUsedAt,
    lastHumanUsedAt,
    timePeriodSec: USAGE_PERIOD_SEC,
  };
}
