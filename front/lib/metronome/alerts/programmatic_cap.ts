import { listMetronomeAlerts } from "@app/lib/metronome/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

function programmaticCapUniquenessKey(workspaceId: string): string {
  return `programmatic-cap-${workspaceId}`;
}

function programmaticCapWarningUniquenessKey(workspaceId: string): string {
  return `programmatic-cap-warning-${workspaceId}`;
}

function programmaticCapLowUniquenessKey(workspaceId: string): string {
  return `programmatic-cap-low-${workspaceId}`;
}

// The uniqueness keys for the four programmatic alerts, keyed by slot. Exported
// so a single alert-list scan can resolve all of them at once.
export function programmaticCapUniquenessKeys(workspaceId: string): {
  cap: string;
  warning: string;
  low: string;
  critical: string;
} {
  return {
    cap: programmaticCapUniquenessKey(workspaceId),
    warning: programmaticCapWarningUniquenessKey(workspaceId),
    low: programmaticCapLowUniquenessKey(workspaceId),
    critical: programmaticCapCriticalUniquenessKey(workspaceId),
  };
}

function programmaticCapCriticalUniquenessKey(workspaceId: string): string {
  return `programmatic-cap-critical-${workspaceId}`;
}

// Early-warning threshold (as a fraction of the monthly cap) fires a
// notification — no state-machine transition, no throttling. Lets admins
// react before the workspace enters the close-to-cap throttle band.
export const WARNING_BALANCE_RATIO = 0.8;

// Warning thresholds: fire alerts this many credits before the cap.
export const LOW_BALANCE_OFFSET = 100;
export const CRITICAL_BALANCE_OFFSET = 10;

// Alert name prefixes used to identify which alert fired in webhook routing.
export const PROGRAMMATIC_CAP_ALERT_NAME = "Programmatic cap";
export const PROGRAMMATIC_WARNING_BALANCE_ALERT_NAME =
  "Programmatic warning balance";
export const PROGRAMMATIC_LOW_BALANCE_ALERT_NAME = "Programmatic low balance";
export const PROGRAMMATIC_CRITICAL_BALANCE_ALERT_NAME =
  "Programmatic critical balance";

type ProgrammaticCapAlertState = {
  id: string;
  threshold: number;
  // Metronome's current evaluation of the alert. We treat `in_alarm` as
  // breached and everything else (`ok` / `evaluating` / `null`) as not.
  status: CustomerAlert["customer_status"];
} | null;

/**
 * Read the current evaluation state of the four programmatic alerts (cap,
 * warning at 80%, low at cap-100, critical at cap-10). Returns `null` for any
 * alert that isn't configured. Used by debug tooling to recompute the
 * programmatic credit state (see `expectedProgrammaticCreditStateFromAlerts`,
 * which ignores `warning` since it's notification-only) and by Poke to
 * deep-link each alert.
 */
export async function getMetronomeProgrammaticCapAlertStates({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<
  Result<
    {
      cap: ProgrammaticCapAlertState;
      warning: ProgrammaticCapAlertState;
      low: ProgrammaticCapAlertState;
      critical: ProgrammaticCapAlertState;
    },
    Error
  >
> {
  const keys = programmaticCapUniquenessKeys(workspaceId);
  const keyToSlot = new Map<string, "cap" | "warning" | "low" | "critical">([
    [keys.cap, "cap"],
    [keys.warning, "warning"],
    [keys.low, "low"],
    [keys.critical, "critical"],
  ]);

  const states: Record<
    "cap" | "warning" | "low" | "critical",
    ProgrammaticCapAlertState
  > = { cap: null, warning: null, low: null, critical: null };

  // Single scan: match all four alerts in one pass over the customer's alerts.
  try {
    for await (const entry of listMetronomeAlerts({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED", "DISABLED"],
    })) {
      const key = entry.alert.uniqueness_key;
      if (!key) {
        continue;
      }
      const slot = keyToSlot.get(key);
      if (slot) {
        states[slot] = {
          id: entry.alert.id,
          threshold: entry.alert.threshold,
          status: entry.customer_status,
        };
      }
    }
  } catch (err) {
    return new Err(normalizeError(err));
  }

  return new Ok(states);
}
