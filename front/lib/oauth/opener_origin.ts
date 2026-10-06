import config from "@app/lib/api/config";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { isDevelopment } from "@app/types/shared/env";
import { isString } from "@app/types/shared/utils/general";

/**
 * Explicit Dust app origins that may receive OAuth finalize postMessage
 * handoffs. Intentionally narrower than the CORS allowlist (which includes
 * third-party surfaces such as Zendesk and Chrome extensions that must not
 * receive a bearer connection id).
 */
const TRUSTED_DUST_OPENER_ORIGINS = new Set<string>([
  "https://app.dust.tt",
  "https://dust.tt",
  "https://eu.dust.tt",
  "https://front-edge.dust.tt",
  "https://eu.front-edge.dust.tt",
  "https://front-ext.dust.tt",
]);

const TRUSTED_DUST_OPENER_ORIGIN_PATTERNS = [
  // Staging / preview deployments.
  /^https:\/\/[a-z0-9-]+\.preview\.dust\.tt$/i,
] as const;

const LOCAL_DEV_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function originOfConfiguredAppUrl(): string | null {
  const appUrl = config.getAppUrl();
  try {
    return new URL(appUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Returns true when `value` is exactly an origin string (scheme + host +
 * optional port, no path/query/hash) for a trusted Dust surface.
 */
export function isTrustedDustOpenerOrigin(value: string): boolean {
  let origin: string;
  try {
    const parsed = new URL(value);
    // Reject anything that is not a pure origin (paths, queries, credentials).
    if (parsed.origin !== value) {
      return false;
    }
    origin = parsed.origin;
  } catch {
    return false;
  }

  if (TRUSTED_DUST_OPENER_ORIGINS.has(origin)) {
    return true;
  }

  if (
    TRUSTED_DUST_OPENER_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))
  ) {
    return true;
  }

  const configuredAppOrigin = originOfConfiguredAppUrl();
  if (configuredAppOrigin && origin === configuredAppOrigin) {
    return true;
  }

  if (isDevelopment() && LOCAL_DEV_ORIGIN_PATTERN.test(origin)) {
    return true;
  }

  return false;
}

/**
 * @cc [owner:sflory,label:security] oauth-opener-origin-allowlist
 * `openerOrigin` accepted at OAuth setup and used as `postMessage` targetOrigin
 * MUST pass `isTrustedDustOpenerOrigin`. Untrusted or malformed values MUST be
 * rejected at setup (not persisted) and MUST NOT be used as postMessage targets
 * at finalize. Caller-supplied `extraConfig.opener_origin` MUST NOT be persisted.
 */
export function resolveOAuthPostMessageTargetOrigin(
  rawOpenerOrigin: unknown,
  fallbackOrigin: string
): string | null {
  if (isString(rawOpenerOrigin) && isTrustedDustOpenerOrigin(rawOpenerOrigin)) {
    return rawOpenerOrigin;
  }

  if (isTrustedDustOpenerOrigin(fallbackOrigin)) {
    return fallbackOrigin;
  }

  return null;
}

/**
 * @cc [owner:sflory,label:security] oauth-finalize-postmessage-payload
 * Finalize `postMessage` success payloads MUST include `connection_id` for the
 * opener handshake and MUST omit connection `metadata`, `redirect_uri`, and
 * other fields not required by openers. Legitimate openers need `connection_id`
 * (and optionally `related_credential_id`); omitting `connection_id` would
 * break those flows without a separate authenticated handoff redesign.
 */
export function connectionPayloadForOpener(
  connection: OAuthConnectionType
): OAuthConnectionType {
  return {
    connection_id: connection.connection_id,
    created: connection.created,
    provider: connection.provider,
    status: connection.status,
    related_credential_id: connection.related_credential_id,
    metadata: {},
  };
}
