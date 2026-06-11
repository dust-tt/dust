import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import config from "@marketing/lib/api/config";
import type { NewsItem } from "@marketing/lib/homepage_news";
import { fetchHomepageNews } from "@marketing/lib/homepage_news";
import { extractUTMParams } from "@marketing/lib/utils/utm";
import { Landing } from "@marketing/pages/home";
import { normalizeError } from "@marketing/types/shared/utils/error_utils";
import logger from "@marketing/logger/logger";
import type { GetServerSideProps } from "next";
import type { ParsedUrlQuery } from "querystring";
import type { ReactElement } from "react";

interface HomeProps {
  postLoginReturnToUrl: string;
  news: NewsItem[];
  shape: number;
  gtmTrackingId: string | null;
}

// Cap the SSR auth-context lookup so a slow/unavailable front API never hangs
// the marketing homepage — we render the landing instead.
const AUTH_CONTEXT_TIMEOUT_MS = 1500;

/**
 * Resolve where an already-authenticated visitor should be sent, server-side.
 *
 * Mirrors the old `front` behaviour (`front/pages/index.tsx` `getServerSideProps`,
 * which called `getSession` and redirected before rendering). Marketing has no
 * WorkOS code of its own, so it asks `front` via `/api/auth-context`, forwarding
 * the incoming cookies — the `workos_session` cookie is scoped to the shared
 * `*.dust.tt` domain (`WORKOS_SESSION_COOKIE_DOMAIN`), so it reaches us here.
 *
 * `/api/auth-context` already returns the default workspace, so we redirect
 * straight to the app (`/w/<id>`) rather than bouncing through `/api/login`,
 * which re-runs the full server-side login flow (a second WorkOS
 * `authenticate()` + invite/membership/audit work) before issuing the same
 * redirect. We fall back to `/api/login` only when there is no default
 * workspace (no-workspace / invite / SSO flows that need it).
 *
 * Returns `null` when the visitor is anonymous or the lookup fails, in which
 * case the caller renders the landing page.
 */
async function resolveAuthedRedirectDestination(
  cookieHeader: string,
  query: ParsedUrlQuery
): Promise<string | null> {
  try {
    const res = await fetch(`${config.getApiBaseUrl()}/api/auth-context`, {
      headers: { cookie: cookieHeader },
      signal: AbortSignal.timeout(AUTH_CONTEXT_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      user?: { sId?: string };
      defaultWorkspaceId?: string | null;
    };
    if (!data.user) {
      return null;
    }

    // Forward only marketing/attribution params (UTM + click IDs) so the
    // destination keeps signup attribution.
    const utmSearchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(extractUTMParams(query))) {
      if (value) {
        utmSearchParams.set(key, value);
      }
    }
    const utmQueryString = utmSearchParams.toString();
    const destinationUrl = data.defaultWorkspaceId
      ? `${config.getAppUrl()}/w/${data.defaultWorkspaceId}`
      : `${config.getApiBaseUrl()}/api/login`;
    return utmQueryString
      ? `${destinationUrl}?${utmQueryString}`
      : destinationUrl;
  } catch (err) {
    logger.warn(
      { err: normalizeError(err) },
      "auth-context lookup failed during marketing root SSR; rendering landing"
    );
    return null;
  }
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async (
  context
) => {
  const { inviteToken } = context.query;

  // On the marketing root, an authenticated user's intent is to open the
  // product, not browse the homepage — so redirect them server-side, before
  // rendering, to avoid the render + hydrate + client fetch round-trip. Gated on
  // the session cookie so anonymous SSR stays a no-op. We do NOT forward
  // inviteToken: an expired/invalid one makes /api/login 400, and the redirect
  // intent doesn't depend on it.
  const cookieHeader = context.req.headers.cookie ?? "";
  if (cookieHeader.includes("workos_session=")) {
    const destination = await resolveAuthedRedirectDestination(
      cookieHeader,
      context.query
    );
    if (destination) {
      logger.info(
        { path: "/" },
        "Redirecting authenticated user from marketing root to the app"
      );
      return {
        redirect: { permanent: false, destination },
      };
    }
  }

  let postLoginCallbackUrl = "/api/login";
  if (inviteToken) {
    postLoginCallbackUrl += `?inviteToken=${inviteToken}`;
  }

  const news = await fetchHomepageNews();

  return {
    props: {
      postLoginReturnToUrl: postLoginCallbackUrl,
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      news,
    },
  };
};

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Home({ news }: HomeProps) {
  return <Landing news={news} />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
