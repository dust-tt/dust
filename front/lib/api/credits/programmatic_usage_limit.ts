import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { reconcileProgrammatic } from "@app/lib/api/metronome/reconcile_credit_state";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomeProgrammaticCapAlerts,
  upsertMetronomeProgrammaticCapAlerts,
} from "@app/lib/metronome/alerts/programmatic_cap";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Read the workspace's programmatic usage monthly cap.
 *
 * The cap is persisted on `credit_usage_configurations` (the source of truth);
 * the Metronome programmatic alerts are derived enforcement. Returns `null`
 * when no cap is configured.
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

  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return new Ok(config?.programmaticMonthlyCapAwuCredits ?? null);
}

/**
 * Set or clear the workspace's programmatic usage monthly cap.
 *
 * Persists the cap on `credit_usage_configurations` (the source of truth),
 * then derives the Metronome programmatic alerts from it (only for positive
 * caps; 0 and null both clear the alerts since a cap of 0 is always depleted),
 * and finally reconciles `programmaticCreditState` so usage-status reflects
 * the change immediately without waiting for a webhook.
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

  // Programmatic cap alerts are AWU-credit based and only meaningful on
  // credit-priced (new-pricing) plans. Legacy programmatic usage is billed in
  // USD via Stripe PAYG and must never create Metronome alerts.
  const plan = auth.plan();
  if (!plan || !isCreditPricedPlan(plan)) {
    return new Err(
      new Error(
        `Programmatic usage limit only applies to credit-priced plans (workspace ${workspace.sId}).`
      )
    );
  }

  // Persist the admin's intent first: the credit-usage configuration column is
  // the source of truth; the Metronome alerts below are derived enforcement (a
  // failed sync can be retried and re-derives from this value). The config row
  // is created lazily, so upsert it. A normalized cap stores `null` (no cap)
  // for any negative/absent value and the value itself otherwise (0 included,
  // as a hard cap).
  const normalizedCapCredits =
    monthlyCapCredits !== null && monthlyCapCredits >= 0
      ? monthlyCapCredits
      : null;
  const existingConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const previousCapCredits =
    existingConfig?.programmaticMonthlyCapAwuCredits ?? null;
  if (existingConfig) {
    await existingConfig.updateConfiguration(auth, {
      programmaticMonthlyCapAwuCredits: normalizedCapCredits,
    });
  } else {
    await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      usageCapCredits: null,
      programmaticMonthlyCapAwuCredits: normalizedCapCredits,
    });
  }

  // Alerts only make sense for a positive cap: a cap of 0 means usage is
  // always fully depleted, so no threshold transition can ever fire.
  const alertResult =
    normalizedCapCredits !== null && normalizedCapCredits > 0
      ? await upsertMetronomeProgrammaticCapAlerts({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
          monthlyCapCredits: normalizedCapCredits,
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

  // Reconcile programmaticCreditState immediately so /usage-status reflects the
  // change without waiting for a Metronome webhook.
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (workspaceResource) {
    await reconcileProgrammatic({
      workspace: workspaceResource,
      metronomeCustomerId: workspace.metronomeCustomerId,
      metronomeContractId: auth.subscription()?.metronomeContractId ?? null,
      execute: true,
    });
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
        normalizedCapCredits !== null ? String(normalizedCapCredits) : "unset",
    },
  });

  return new Ok(undefined);
}
