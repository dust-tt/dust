import config from "@app/lib/api/config";
import { ExternalViewerSessionResource } from "@app/lib/resources/external_viewer_session_resource";
import { isDevelopment, isTest } from "@app/types/shared/env";

export const FRAME_SESSION_COOKIE_NAME = "dust_frame_session";

export function serializeFrameSessionCookie(
  session: ExternalViewerSessionResource
): string {
  const isLocal = isDevelopment() || isTest();
  const domain = isLocal ? undefined : config.getWorkOSSessionCookieDomain();
  const secureFlag = isLocal ? "" : "; Secure";
  const cookieValue = `${FRAME_SESSION_COOKIE_NAME}=${session.sessionToken}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=${ExternalViewerSessionResource.durationSeconds}`;

  return domain ? `${cookieValue}; Domain=${domain}` : cookieValue;
}
