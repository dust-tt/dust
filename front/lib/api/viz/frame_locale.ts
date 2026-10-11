import type { Authenticator } from "@app/lib/auth";
import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE } from "@app/types/locale";

/**
 * @cc [owner:ykmsd,label:product] frame-export-follows-requester-locale
 * MUST return `DEFAULT_LOCALE` when the `localisation` flag is disabled for the workspace. Otherwise
 * it MUST return the requester's locale (`UserResource.getLocale` with the workspace locale as
 * fallback), or the workspace locale when the authenticator has no user. Server-side Frame
 * renders (PDF, screenshot) MUST pass it as the `locale` param of the viz `/content` URL, so that
 * they match what the requester sees in the app (`authenticated-frame-follows-active-locale`).
 */
export async function getFrameExportLocale(
  auth: Authenticator
): Promise<SupportedLocale> {
  if (!(await auth.hasFeatureFlag("localisation"))) {
    return DEFAULT_LOCALE;
  }
  const workspaceLocale = auth.getNonNullableWorkspace().locale;
  const user = auth.user();
  return user ? user.getLocale(workspaceLocale) : workspaceLocale;
}
