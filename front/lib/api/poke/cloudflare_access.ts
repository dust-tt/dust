import config from "@app/lib/api/config";
import { trustedFetch } from "@app/lib/egress/server";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const ACCESS_ASSERTION_HEADER = "Cf-Access-Jwt-Assertion";
const ACCESS_IDENTITY_COOKIE = "CF_Authorization";
const DEFAULT_TEAM_DOMAIN = "https://teamdust.cloudflareaccess.com";

const JWKS_REQUEST_TIMEOUT_MS = 5_000;
const JWKS_COOLDOWN_MS = 30_000;
const IDENTITY_REQUEST_TIMEOUT_MS = 3_000;

/**
 * Identity evidence backing an authenticated Access principal. The union keeps
 * `jwt_only` distinguishable from a cross-checked, genuinely empty group set,
 * so role resolution cannot mistake one for the other.
 */
export type AccessIdentityEvidence =
  | { kind: "cross_checked"; groupNames: readonly string[] }
  | { kind: "jwt_only" };

export type AuthenticatedAccessUser = {
  subject: string;
  email: string;
  name: string | null;
  identity: AccessIdentityEvidence;
};

/** Closed, secret-free taxonomy. Safe to log; never returned to a client. */
export type CloudflareAccessDenialCode =
  | "partial_configuration"
  | "invalid_team_domain"
  | "non_https_certs_url"
  | "non_https_identity_url"
  | "missing_assertion"
  | "invalid_assertion"
  | "unsupported_algorithm"
  | "missing_kid"
  | "unknown_kid"
  | "missing_claims"
  | "missing_identity_cookie"
  | "invalid_identity_cookie"
  | "identity_unavailable"
  | "identity_redirect"
  | "identity_non_success"
  | "invalid_identity_payload"
  | "identity_subject_mismatch"
  | "identity_email_mismatch";

export type CloudflareAccessAuthentication =
  // Access is not configured at all. The only result that permits the WorkOS
  // super-user fallback.
  | { kind: "disabled" }
  | { kind: "authenticated"; user: AuthenticatedAccessUser }
  | { kind: "rejected"; reasonCode: CloudflareAccessDenialCode };

type EnabledCloudflareAccessConfig = {
  issuer: string;
  audience: string;
  certsUrl: URL;
  identityUrl: URL;
  identityRequired: boolean;
};

type CloudflareAccessConfig =
  | { kind: "disabled" }
  | { kind: "invalid"; reasonCode: CloudflareAccessDenialCode }
  | { kind: "enabled"; value: EnabledCloudflareAccessConfig };

type VerifiedAssertion = {
  subject: string;
  email: string;
  name: string | null;
};

type ParsedAccessIdentity = {
  userUuid: string;
  email: string;
  groupNames: readonly string[];
};

const AccessIdentityPayloadSchema = z.object({
  user_uuid: z.string().min(1),
  email: z.string().email(),
  groups: z
    .array(z.object({ name: z.string() }))
    .nullish()
    .transform((groups) => groups ?? []),
});

const jwksByCertsUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseHttpsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") {
    return null;
  }
  // Credentials embedded in a URL would be attached to every outbound request.
  if (url.username.length > 0 || url.password.length > 0) {
    return null;
  }
  return url;
}

function parseTeamDomain(raw: string): URL | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return parseHttpsUrl(withScheme);
}

function resolveCloudflareAccessConfig(): CloudflareAccessConfig {
  const audience = config.getCloudflareAccessAudience()?.trim();
  const teamDomain = config.getCloudflareAccessTeamDomain()?.trim();
  const certsUrlOverride = config.getCloudflareAccessCertsUrl()?.trim();
  const identityUrlOverride = config.getCloudflareAccessIdentityUrl()?.trim();
  const identityRequiredRaw = config
    .getCloudflareAccessIdentityRequired()
    ?.trim();

  if (!audience) {
    const hasDependentSetting = [
      teamDomain,
      certsUrlOverride,
      identityUrlOverride,
      identityRequiredRaw,
    ].some((value) => Boolean(value));
    // Half-configured Access must never degrade into the WorkOS fallback.
    return hasDependentSetting
      ? { kind: "invalid", reasonCode: "partial_configuration" }
      : { kind: "disabled" };
  }

  const teamDomainUrl = parseTeamDomain(teamDomain ?? DEFAULT_TEAM_DOMAIN);
  if (!teamDomainUrl) {
    return { kind: "invalid", reasonCode: "invalid_team_domain" };
  }
  const issuer = teamDomainUrl.origin;

  const certsUrl = parseHttpsUrl(
    certsUrlOverride ?? `${issuer}/cdn-cgi/access/certs`
  );
  if (!certsUrl) {
    return { kind: "invalid", reasonCode: "non_https_certs_url" };
  }

  const identityUrl = parseHttpsUrl(
    identityUrlOverride ?? `${issuer}/cdn-cgi/access/get-identity`
  );
  if (!identityUrl) {
    return { kind: "invalid", reasonCode: "non_https_identity_url" };
  }

  return {
    kind: "enabled",
    value: {
      issuer,
      audience,
      certsUrl,
      identityUrl,
      identityRequired: identityRequiredRaw !== "false",
    },
  };
}

function getJwks(certsUrl: URL): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksByCertsUrl.get(certsUrl.href);
  if (cached) {
    return cached;
  }
  const jwks = createRemoteJWKSet(certsUrl, {
    timeoutDuration: JWKS_REQUEST_TIMEOUT_MS,
    cooldownDuration: JWKS_COOLDOWN_MS,
  });
  jwksByCertsUrl.set(certsUrl.href, jwks);
  return jwks;
}

function isUnknownKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ERR_JWKS_NO_MATCHING_KEY"
  );
}

function parseVerifiedAssertion({
  payload,
  protectedHeader,
}: {
  payload: unknown;
  protectedHeader: unknown;
}): Result<VerifiedAssertion, CloudflareAccessDenialCode> {
  const header = z
    .object({ alg: z.string(), kid: z.string().min(1) })
    .safeParse(protectedHeader);
  if (!header.success) {
    return new Err("missing_kid");
  }
  if (header.data.alg !== "RS256") {
    return new Err("unsupported_algorithm");
  }

  // `jwtVerify` owns signature, issuer, audience and temporal validation; this
  // parse makes the claims we depend on mandatory rather than optional.
  const claims = z
    .object({
      sub: z.string().min(1),
      email: z.string().email(),
      exp: z.number(),
      nbf: z.number(),
      name: z.string().nullish(),
    })
    .safeParse(payload);
  if (!claims.success) {
    return new Err("missing_claims");
  }

  const name = claims.data.name?.trim();
  return new Ok({
    subject: claims.data.sub,
    email: canonicalEmail(claims.data.email),
    name: name && name.length > 0 ? name : null,
  });
}

async function verifyAssertion(
  assertion: string,
  accessConfig: EnabledCloudflareAccessConfig
): Promise<Result<VerifiedAssertion, CloudflareAccessDenialCode>> {
  const verifyOnce = async () =>
    jwtVerify(assertion, getJwks(accessConfig.certsUrl), {
      algorithms: ["RS256"],
      issuer: accessConfig.issuer,
      audience: accessConfig.audience,
    });

  let verified: Awaited<ReturnType<typeof verifyOnce>>;
  try {
    verified = await verifyOnce();
  } catch (err) {
    if (!isUnknownKeyError(err)) {
      return new Err("invalid_assertion");
    }
    // Cloudflare rotates signing keys without warning. Drop the cached key set
    // so the retry refetches instead of waiting out jose's cooldown.
    jwksByCertsUrl.delete(accessConfig.certsUrl.href);
    try {
      verified = await verifyOnce();
    } catch (retryErr) {
      return new Err(
        isUnknownKeyError(retryErr) ? "unknown_kid" : "invalid_assertion"
      );
    }
  }

  return parseVerifiedAssertion(verified);
}

function readAccessIdentityCookie(headers: Headers): string | null {
  const cookieHeader = headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (pair.slice(0, separator).trim() !== ACCESS_IDENTITY_COOKIE) {
      continue;
    }
    const value = pair.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

// RFC 6265 cookie-octet. Excluding CTLs, whitespace, `"`, `,`, `;` and `\` keeps
// a client-supplied value from injecting into the outbound Cookie header.
const COOKIE_OCTETS = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;

async function fetchAccessIdentity(
  identityCookie: string,
  accessConfig: EnabledCloudflareAccessConfig
): Promise<Result<ParsedAccessIdentity, CloudflareAccessDenialCode>> {
  let response;
  try {
    response = await trustedFetch(accessConfig.identityUrl.href, {
      method: "GET",
      headers: { Cookie: `${ACCESS_IDENTITY_COOKIE}=${identityCookie}` },
      redirect: "manual",
      signal: AbortSignal.timeout(IDENTITY_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return new Err("identity_unavailable");
  }

  if (response.status >= 300 && response.status < 400) {
    return new Err("identity_redirect");
  }
  if (!response.ok) {
    return new Err("identity_non_success");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new Err("invalid_identity_payload");
  }

  const parsed = AccessIdentityPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return new Err("invalid_identity_payload");
  }

  const groupNames = new Set<string>();
  for (const group of parsed.data.groups) {
    const name = group.name.trim().toLowerCase();
    if (name.length > 0) {
      groupNames.add(name);
    }
  }

  return new Ok({
    userUuid: parsed.data.user_uuid,
    email: canonicalEmail(parsed.data.email),
    groupNames: [...groupNames],
  });
}

function crossCheckAccessIdentity(
  assertion: VerifiedAssertion,
  identity: ParsedAccessIdentity
): Result<readonly string[], CloudflareAccessDenialCode> {
  if (identity.userUuid !== assertion.subject) {
    return new Err("identity_subject_mismatch");
  }
  if (identity.email !== assertion.email) {
    return new Err("identity_email_mismatch");
  }
  return new Ok(identity.groupNames);
}

function authenticated(
  assertion: VerifiedAssertion,
  identity: AccessIdentityEvidence
): CloudflareAccessAuthentication {
  return {
    kind: "authenticated",
    user: {
      subject: assertion.subject,
      email: assertion.email,
      name: assertion.name,
      identity,
    },
  };
}

/**
 * @cc [label:security;api] assertion-header-only
 * When Cloudflare Access is configured, authentication must require a non-empty
 * `Cf-Access-Jwt-Assertion` header and must never accept `CF_Authorization` as a
 * substitute for it.
 */
/**
 * @cc [label:security] identity-cookie-isolation
 * The get-identity request must forward only the `CF_Authorization` cookie and must
 * never forward the assertion, the incoming `Cookie` header, or any other inbound
 * header.
 */
/**
 * @cc [label:security] identity-cross-check
 * A parsed get-identity response must match the assertion's `sub` to `user_uuid`
 * exactly and its email case-insensitively; either mismatch rejects authentication
 * regardless of `CLOUDFLARE_ACCESS_IDENTITY_REQUIRED`.
 */
/**
 * @cc [label:security] assertion-owns-principal
 * `subject`, `email` and `name` on the returned user must come from the verified
 * assertion; a get-identity response contributes group names only.
 */
/**
 * @cc [label:security;logging] secret-free-result
 * The returned value must never carry the assertion, the authorization cookie, raw
 * JWT claims, a raw get-identity payload, or an underlying error; failures are
 * reported as a `CloudflareAccessDenialCode`.
 */
/**
 * @cc [label:security] partial-configuration-fails-closed
 * `disabled` must be returned only when no audience and no dependent
 * `CLOUDFLARE_ACCESS_*` setting is configured; any other configuration defect
 * rejects.
 */
export async function authenticateCloudflareAccess(
  headers: Headers
): Promise<CloudflareAccessAuthentication> {
  const accessConfig = resolveCloudflareAccessConfig();
  if (accessConfig.kind === "disabled") {
    return { kind: "disabled" };
  }
  if (accessConfig.kind === "invalid") {
    return { kind: "rejected", reasonCode: accessConfig.reasonCode };
  }
  const enabled = accessConfig.value;

  const assertion = headers.get(ACCESS_ASSERTION_HEADER)?.trim();
  if (!assertion) {
    return { kind: "rejected", reasonCode: "missing_assertion" };
  }

  const verified = await verifyAssertion(assertion, enabled);
  if (verified.isErr()) {
    return { kind: "rejected", reasonCode: verified.error };
  }

  const identityCookie = readAccessIdentityCookie(headers);
  if (identityCookie === null) {
    return enabled.identityRequired
      ? { kind: "rejected", reasonCode: "missing_identity_cookie" }
      : authenticated(verified.value, { kind: "jwt_only" });
  }
  if (!COOKIE_OCTETS.test(identityCookie)) {
    return { kind: "rejected", reasonCode: "invalid_identity_cookie" };
  }

  const identity = await fetchAccessIdentity(identityCookie, enabled);
  if (identity.isErr()) {
    return enabled.identityRequired
      ? { kind: "rejected", reasonCode: identity.error }
      : authenticated(verified.value, { kind: "jwt_only" });
  }

  const groupNames = crossCheckAccessIdentity(verified.value, identity.value);
  if (groupNames.isErr()) {
    return { kind: "rejected", reasonCode: groupNames.error };
  }

  return authenticated(verified.value, {
    kind: "cross_checked",
    groupNames: groupNames.value,
  });
}

/** Test-only helper to clear the cached JWKS between cases. */
export function clearCloudflareAccessJwksCacheForTests(): void {
  jwksByCertsUrl.clear();
}
