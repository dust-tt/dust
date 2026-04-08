import type { ProvidersHealth } from "@app/types/provider_credential";

export function hasHealthyProviders(
  providersHealth: ProvidersHealth | null
): boolean {
  // BYOK workspaces can't have a null providersHealth
  if (!providersHealth) {
    return true;
  }
  return Object.values(providersHealth).some(Boolean);
}
