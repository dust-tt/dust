import config from "@marketing/lib/api/config";
import logger from "@marketing/logger/logger";
import { assertNever } from "@marketing/types/shared/utils/assert_never";
import { normalizeError } from "@marketing/types/shared/utils/error_utils";
import { safeParseJSON } from "@marketing/types/shared/utils/json_utils";
import type { UserType } from "@marketing/types/user";
import { z } from "zod";

const AUTH_CONTEXT_PATH = "/api/auth-context";

export const AUTH_CONTEXT_URL = `${config.getApiBaseUrl()}${AUTH_CONTEXT_PATH}`;

// Cap each SSR auth-context request so a slow/unavailable front API never hangs
// pages. A session from another region costs two requests (home region, then
// regional host), so the worst case is twice this value.
export const AUTH_CONTEXT_TIMEOUT_MS = 1_500;

export type MarketingAuthContext = {
  user: UserType;
  defaultWorkspaceId: string | null;
};

const AuthContextUserSchema = z.object({
  sId: z.string(),
  id: z.number(),
  createdAt: z.number(),
  provider: z
    .enum(["auth0", "github", "google", "okta", "samlp", "waad"])
    .nullable(),
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  image: z.string().nullable(),
  lastLoginAt: z.number().nullable(),
});

const AuthContextResponseSchema = z.object({
  user: AuthContextUserSchema,
  defaultWorkspaceId: z.string().nullable().optional(),
});

// front-api answers 400 with this body when the session's workspace lives in
// the other region. Mirrors `RegionRedirectError` in front/types/error.ts.
const RegionRedirectSchema = z.object({
  region: z.string(),
  url: z.string().url(),
});

const RegionRedirectResponseSchema = z.object({
  error: z.object({
    type: z.literal("workspace_in_different_region"),
    redirect: RegionRedirectSchema,
  }),
});

type ParsedAuthContextResponse =
  | { type: "success"; authContext: MarketingAuthContext }
  | { type: "region_redirect"; redirect: z.infer<typeof RegionRedirectSchema> }
  | { type: "failure" };

async function parseAuthContextResponse(
  response: Response
): Promise<ParsedAuthContextResponse> {
  const body = safeParseJSON(await response.text());
  if (body.isErr()) {
    return { type: "failure" };
  }

  if (response.ok) {
    const parsed = AuthContextResponseSchema.safeParse(body.value);
    if (!parsed.success) {
      return { type: "failure" };
    }
    return {
      type: "success",
      authContext: {
        user: parsed.data.user,
        defaultWorkspaceId: parsed.data.defaultWorkspaceId ?? null,
      },
    };
  }

  const redirect = RegionRedirectResponseSchema.safeParse(body.value);
  if (redirect.success) {
    return { type: "region_redirect", redirect: redirect.data.error.redirect };
  }

  return { type: "failure" };
}

export type AuthContextResolution =
  | { type: "success"; authContext: MarketingAuthContext }
  | { type: "failure"; status: number }
  | { type: "regional_failure"; region: string; status: number };

/**
 * Fetch the auth context from `url`, following a region redirect once.
 *
 * `fetchUrl` supplies the transport (cookie forwarding on the server, browser
 * credentials on the client). `redirect.url` is trusted as-is: front-api builds
 * it from its own region config. A second redirect is treated as a failure, so
 * at most two requests are ever made.
 */
export async function resolveAuthContext(
  url: string,
  fetchUrl: (url: string) => Promise<Response>
): Promise<AuthContextResolution> {
  const initialResponse = await fetchUrl(url);
  const initial = await parseAuthContextResponse(initialResponse);

  switch (initial.type) {
    case "success":
      return initial;
    case "failure":
      return { type: "failure", status: initialResponse.status };
    case "region_redirect": {
      const { region } = initial.redirect;
      const regionalResponse = await fetchUrl(
        new URL(AUTH_CONTEXT_PATH, initial.redirect.url).toString()
      );
      const regional = await parseAuthContextResponse(regionalResponse);
      if (regional.type !== "success") {
        return {
          type: "regional_failure",
          region,
          status: regionalResponse.status,
        };
      }
      return regional;
    }
    default:
      assertNever(initial);
  }
}

export function hasWorkosSessionCookie(cookieHeader: string): boolean {
  return cookieHeader.includes("workos_session=");
}

/**
 * Server-side auth-context lookup for marketing pages.
 *
 * Marketing has no WorkOS code of its own, so it asks `front` via
 * `/api/auth-context`, forwarding the incoming cookies — the
 * `workos_session` cookie is scoped to the shared `*.dust.tt` domain.
 */
export async function fetchAuthContext(
  cookieHeader: string,
  {
    failureLogMessage = "auth-context lookup failed",
  }: { failureLogMessage?: string } = {}
): Promise<MarketingAuthContext | null> {
  try {
    const resolution = await resolveAuthContext(AUTH_CONTEXT_URL, (url) =>
      fetch(url, {
        headers: { cookie: cookieHeader },
        signal: AbortSignal.timeout(AUTH_CONTEXT_TIMEOUT_MS),
      })
    );

    switch (resolution.type) {
      case "success":
        return resolution.authContext;
      case "failure":
        // 401/403 is the normal anonymous path. Anything 5xx means front-api is
        // degraded and would otherwise be indistinguishable from anonymous.
        if (resolution.status >= 500) {
          logger.warn(
            { statusCode: resolution.status, context: failureLogMessage },
            "auth-context lookup failed upstream"
          );
        }
        return null;
      case "regional_failure":
        logger.warn(
          {
            region: resolution.region,
            statusCode: resolution.status,
            context: failureLogMessage,
          },
          "auth-context regional retry failed"
        );
        return null;
      default:
        assertNever(resolution);
    }
  } catch (err) {
    logger.warn({ err: normalizeError(err) }, failureLogMessage);
    return null;
  }
}
