import type { Authenticator } from "@app/lib/auth";
import type { SupportedLocale } from "@app/types/locale";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

/**
 * @cc [owner:Nils-Fedrigo,label:product] agent-locale-behind-localisation
 * MUST return `null` while the `localisation` flag is off or there is no user, so agents keep
 * their English defaults; otherwise the user's locale, falling back to the workspace locale.
 */
export async function getAgentLocale(
  auth: Authenticator,
  featureFlags: WhitelistableFeature[]
): Promise<SupportedLocale | null> {
  const user = auth.user();
  if (!featureFlags.includes("localisation") || !user) {
    return null;
  }

  return user.getLocale(auth.getNonNullableWorkspace().locale);
}
