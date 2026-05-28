import type { Authenticator } from "@app/lib/auth";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";

/**
 * PAYG status for credit-priced (Metronome) workspaces. PAYG is considered
 * enabled when the workspace has a `credit_usage_configuration` row with a
 * non-null `paygCapCredits` cap.
 *
 * NOTE: this is the credit-pricing counterpart of
 * `front/lib/credits/payg.ts:isPAYGEnabled`, which serves the legacy
 * programmatic-usage / Stripe flow and reads
 * `programmatic_usage_configuration.paygCapMicroUsd`. Credit-based pricing
 * code paths must never read the programmatic config and vice-versa.
 */
export async function isPAYGEnabled(auth: Authenticator): Promise<boolean> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config !== null && config.paygCapCredits !== null;
}
