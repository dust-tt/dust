import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { isOrganizationSelectionRequiredError } from "@app/lib/api/workos/types";
import { GenericServerException } from "@workos-inc/node";

/**
 * Exchanges a WorkOS authorization code for a sealed session.
 *
 * When the code is bound to a login that already specified an organization
 * and WorkOS requires explicit organization selection, we transparently
 * complete the second step using the provided organizationId.
 *
 * Other WorkOS errors are re-thrown so the caller can map them to the
 * appropriate transport response (HTTP status, redirect, etc.).
 */
export async function authenticateWithWorkOSCode({
  code,
  codeVerifier,
  organizationId,
}: {
  code: string;
  codeVerifier?: string;
  organizationId?: string;
}) {
  try {
    return await getWorkOS().userManagement.authenticateWithCode({
      code,
      codeVerifier,
      clientId: config.getWorkOSClientId(),
      session: {
        sealSession: true,
        cookiePassword: config.getWorkOSCookiePassword(),
      },
    });
  } catch (error) {
    if (error instanceof GenericServerException) {
      const errorData = error.rawData;
      // In case we're coming from a login with organizationId, we need to
      // complete the authentication with organization selection.
      if (organizationId && isOrganizationSelectionRequiredError(errorData)) {
        return getWorkOS().userManagement.authenticateWithOrganizationSelection(
          {
            clientId: config.getWorkOSClientId(),
            pendingAuthenticationToken: errorData.pending_authentication_token,
            organizationId,
            session: {
              sealSession: true,
              cookiePassword: config.getWorkOSCookiePassword(),
            },
          }
        );
      }
    }

    throw error;
  }
}
