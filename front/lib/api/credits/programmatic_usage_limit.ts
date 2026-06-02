import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomeProgrammaticCapAlerts,
  getMetronomeProgrammaticCap,
  upsertMetronomeProgrammaticCapAlerts,
} from "@app/lib/metronome/alerts/programmatic_cap";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Read the workspace's programmatic usage monthly cap.
 *
 * Metronome is the source of truth: the cap is the threshold of the
 * workspace's programmatic cap alert. Returns `null` when no cap is
 * configured.
 */
export async function getProgrammaticUsageLimit(
  auth: Authenticator
): Promise<Result<number | null, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new Error(`Workspace ${workspace.sId} has no Metronome customer ID.`)
    );
  }

  const result = await getMetronomeProgrammaticCap({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  if (result.isErr()) {
    return new Err(
      new Error(
        `Failed to read programmatic cap from Metronome: ${result.error.message}`
      )
    );
  }
  return new Ok(result.value);
}

/**
 * Set or clear the workspace's programmatic usage monthly cap.
 *
 * A strictly positive `monthlyCapCredits` upserts the three programmatic cap
 * alerts (cap, low balance, critical balance); `null` clears them.
 */
export async function syncProgrammaticUsageLimit({
  auth,
  monthlyCapCredits,
  auditContext,
}: {
  auth: Authenticator;
  monthlyCapCredits: number | null;
  auditContext?: AuditLogContext;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new Error(`Workspace ${workspace.sId} has no Metronome customer ID.`)
    );
  }

  // Read previous cap for audit metadata (best-effort).
  const previousResult = await getMetronomeProgrammaticCap({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  const previousCapCredits = previousResult.isOk()
    ? previousResult.value
    : null;

  const alertResult =
    monthlyCapCredits !== null && monthlyCapCredits >= 0
      ? await upsertMetronomeProgrammaticCapAlerts({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
          monthlyCapCredits,
        })
      : await clearMetronomeProgrammaticCapAlerts({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
        });
  if (alertResult.isErr()) {
    return new Err(
      new Error(
        `Failed to sync Metronome programmatic cap alerts: ${alertResult.error.message}`
      )
    );
  }

  void emitAuditLogEvent({
    auth,
    action: "workspace.programmatic_usage_limit_updated",
    targets: [buildAuditLogTarget("workspace", workspace)],
    context: auditContext,
    metadata: {
      previous_monthly_cap_credits:
        previousCapCredits !== null ? String(previousCapCredits) : "unset",
      new_monthly_cap_credits:
        monthlyCapCredits !== null ? String(monthlyCapCredits) : "unset",
    },
  });

  return new Ok(undefined);
}
