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
 * configured, or when the workspace has no Metronome customer.
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
 * No-op when the workspace has no Metronome customer.
 */
export async function syncProgrammaticUsageLimit({
  auth,
  monthlyCapCredits,
}: {
  auth: Authenticator;
  monthlyCapCredits: number | null;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new Error(`Workspace ${workspace.sId} has no Metronome customer ID.`)
    );
  }

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

  return new Ok(undefined);
}
