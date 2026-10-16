import type { Authenticator } from "@app/lib/auth";
import type { SupportedLocale } from "@app/types/locale";

/**
 * @cc [owner:Nils-Fedrigo,label:product] agent-locale
 * MUST return `null` when there is no user, so agents keep their English defaults; otherwise the
 * user's locale, falling back to the workspace locale.
 */
export async function getAgentLocale(
  auth: Authenticator
): Promise<SupportedLocale | null> {
  const user = auth.user();
  if (!user) {
    return null;
  }

  return user.getLocale(auth.getNonNullableWorkspace().locale);
}
