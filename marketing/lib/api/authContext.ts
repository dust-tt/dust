import config from "@marketing/lib/api/config";
import logger from "@marketing/logger/logger";
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
    const res = await fetch(AUTH_CONTEXT_URL, {
      headers: { cookie: cookieHeader },
      signal: AbortSignal.timeout(AUTH_CONTEXT_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const parsed = AuthContextResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      return null;
    }
    return {
      user: parsed.data.user,
      defaultWorkspaceId: parsed.data.defaultWorkspaceId ?? null,
    };
  } catch (err) {
    logger.warn({ err: normalizeError(err) }, failureLogMessage);
    return null;
  }
}
