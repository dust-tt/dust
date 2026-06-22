/** Grant types accepted by WorkOS AuthKit dynamic client registration. */
export const WORKOS_DCR_GRANT_TYPES = [
  "authorization_code",
  "refresh_token",
] as const;

const WORKOS_DCR_GRANT_TYPE_SET = new Set<string>(WORKOS_DCR_GRANT_TYPES);

/**
 * WorkOS AuthKit metadata advertises device_code, but `/oauth2/register` rejects
 * it. Strip unsupported grant types before proxying DCR (e.g. Raycast MCP).
 */
export function sanitizeOAuthRegistrationRequestBody(body: string): string {
  try {
    const payload = JSON.parse(body) as { grant_types?: unknown };
    if (!Array.isArray(payload.grant_types)) {
      return body;
    }

    const grantTypes = payload.grant_types.filter(
      (grantType): grantType is string =>
        typeof grantType === "string" &&
        WORKOS_DCR_GRANT_TYPE_SET.has(grantType)
    );

    if (grantTypes.length === payload.grant_types.length) {
      return body;
    }

    if (grantTypes.length === 0) {
      return body;
    }

    return JSON.stringify({ ...payload, grant_types: grantTypes });
  } catch {
    return body;
  }
}
