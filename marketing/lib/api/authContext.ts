import config from "@marketing/lib/api/config";
import logger from "@marketing/logger/logger";
import { assertNever } from "@marketing/types/shared/utils/assert_never";
import { normalizeError } from "@marketing/types/shared/utils/error_utils";
import type { UserType } from "@marketing/types/user";
import { z } from "zod";

export const AUTH_CONTEXT_URL = `${config.getApiBaseUrl()}/api/auth-context`;

// Cap SSR auth-context lookups so a slow/unavailable front API never hangs pages.
export const AUTH_CONTEXT_TIMEOUT_MS = 1500;

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

const RegionRedirectResponseSchema = z.object({
  error: z.object({
    type: z.literal("workspace_in_different_region"),
    message: z.string(),
    redirect: z.object({
      region: z.string(),
      url: z.string().url(),
    }),
  }),
});

export type MarketingRegionRedirect = z.infer<
  typeof RegionRedirectResponseSchema
>["error"]["redirect"];

type AuthContextResponse =
  | { type: "success"; authContext: MarketingAuthContext }
  | { type: "region_redirect"; redirect: MarketingRegionRedirect }
  | null;

/**
 * Parse the auth-context response while preserving the cross-region routing
 * signal. This is shared by the server-side and browser-side marketing flows.
 */
export async function parseAuthContextResponse(
  response: Response
): Promise<AuthContextResponse> {
  const body: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const parsed = AuthContextResponseSchema.safeParse(body);
    if (!parsed.success) {
      return null;
    }
    return {
      type: "success",
      authContext: {
        user: parsed.data.user,
        defaultWorkspaceId: parsed.data.defaultWorkspaceId ?? null,
      },
    };
  }

  const regionRedirect = RegionRedirectResponseSchema.safeParse(body);
  if (regionRedirect.success) {
    return {
      type: "region_redirect",
      redirect: regionRedirect.data.error.redirect,
    };
  }

  return null;
}

/**
 * Build the regional auth-context URL returned by front-api, while refusing
 * unexpected hosts before forwarding the session cookie or browser credentials.
 */
export function getRegionalAuthContextUrl(
  redirect: MarketingRegionRedirect
): string | null {
  try {
    const url = new URL("/api/auth-context", redirect.url);
    const isDustHost =
      url.hostname === "dust.tt" || url.hostname.endsWith(".dust.tt");
    const isLocalHost =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && isLocalHost)
    ) {
      return null;
    }
    if (!isDustHost && !isLocalHost) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
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
    const deadline = Date.now() + AUTH_CONTEXT_TIMEOUT_MS;
    const fetchAt = async (url: string): Promise<AuthContextResponse> => {
      const remainingMs = Math.max(deadline - Date.now(), 1);
      const response = await fetch(url, {
        headers: { cookie: cookieHeader },
        signal: AbortSignal.timeout(remainingMs),
      });
      return parseAuthContextResponse(response);
    };

    const initialResponse = await fetchAt(AUTH_CONTEXT_URL);
    if (!initialResponse) {
      return null;
    }

    switch (initialResponse.type) {
      case "region_redirect": {
        const regionalUrl = getRegionalAuthContextUrl(initialResponse.redirect);
        if (!regionalUrl || regionalUrl === AUTH_CONTEXT_URL) {
          return null;
        }

        const regionalResponse = await fetchAt(regionalUrl);
        if (regionalResponse?.type !== "success") {
          logger.warn(
            { region: initialResponse.redirect.region },
            `${failureLogMessage}: regional retry failed`
          );
          return null;
        }
        return regionalResponse.authContext;
      }
      case "success":
        return initialResponse.authContext;
      default:
        assertNever(initialResponse);
    }
  } catch (err) {
    logger.warn({ err: normalizeError(err) }, failureLogMessage);
    return null;
  }
}
