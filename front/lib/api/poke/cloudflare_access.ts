import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type CloudflareAccessIdentity = {
  email: string;
  name: string | null;
  sub: string;
};

type CloudflareAccessConfig = {
  teamDomain: string;
  aud: string;
};

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksIssuer: string | null = null;

function normalizeTeamDomain(teamDomain: string): string {
  return teamDomain.startsWith("https://")
    ? teamDomain.replace(/\/$/, "")
    : `https://${teamDomain.replace(/\/$/, "")}`;
}

export function getCloudflareAccessConfig(): CloudflareAccessConfig | null {
  const teamDomain = config.getCloudflareAccessTeamDomain();
  const aud = config.getCloudflareAccessAud();
  if (!teamDomain || !aud) {
    return null;
  }
  return { teamDomain: normalizeTeamDomain(teamDomain), aud };
}

function getJwks(issuer: string) {
  if (cachedJwks && cachedJwksIssuer === issuer) {
    return cachedJwks;
  }
  cachedJwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  cachedJwksIssuer = issuer;
  return cachedJwks;
}

/**
 * Validates a Cloudflare Access application JWT.
 *
 * Prefer the `Cf-Access-Jwt-Assertion` header (what Cloudflare injects at the
 * edge). Fall back to the `CF_Authorization` cookie for browser same-origin
 * requests where the header may not be forwarded.
 *
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */
export async function verifyCloudflareAccessJwt(
  token: string
): Promise<CloudflareAccessIdentity | null> {
  const accessConfig = getCloudflareAccessConfig();
  if (!accessConfig) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(
      token,
      getJwks(accessConfig.teamDomain),
      {
        issuer: accessConfig.teamDomain,
        audience: accessConfig.aud,
      }
    );

    const email =
      typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!email || !sub) {
      logger.warn(
        { hasEmail: !!email, hasSub: !!sub },
        "[poke] Cloudflare Access JWT missing email or sub claim"
      );
      return null;
    }

    const name =
      typeof payload.name === "string" && payload.name.trim().length > 0
        ? payload.name.trim()
        : null;

    return { email, name, sub };
  } catch (err) {
    logger.warn(
      { err: normalizeError(err) },
      "[poke] Cloudflare Access JWT verification failed"
    );
    return null;
  }
}

/** Test-only helper to clear the cached JWKS between cases. */
export function clearCloudflareAccessJwksCacheForTests(): void {
  cachedJwks = null;
  cachedJwksIssuer = null;
}
