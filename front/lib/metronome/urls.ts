import { isDevelopment } from "@app/types/shared/env";

/**
 * Helpers to build links into the Metronome web dashboard. Used by Poke pages
 * and tools to deep-link from a workspace into its Metronome resources.
 *
 * In development we route to the sandbox instance; in production to the live
 * dashboard. Pure URL builders — safe to call from both client and server.
 */

const METRONOME_DASHBOARD_BASE_URL = "https://app.metronome.com";

function metronomeDashboardCustomerBase(metronomeCustomerId: string): string {
  const envPrefix = isDevelopment() ? "sandbox/" : "";
  return `${METRONOME_DASHBOARD_BASE_URL}/${envPrefix}customers/${metronomeCustomerId}`;
}

export function getMetronomeCustomerUrl(metronomeCustomerId: string): string {
  return metronomeDashboardCustomerBase(metronomeCustomerId);
}

export function getMetronomeContractUrl(
  metronomeCustomerId: string,
  metronomeContractId: string
): string {
  return `${metronomeDashboardCustomerBase(metronomeCustomerId)}/contracts/${metronomeContractId}`;
}

export function getMetronomeCommitOrCreditUrl(
  metronomeCustomerId: string,
  commitOrCreditId: string
): string {
  return `${metronomeDashboardCustomerBase(metronomeCustomerId)}/commits-and-credits/${commitOrCreditId}?tab=ledger`;
}
