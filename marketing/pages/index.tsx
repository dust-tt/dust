import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import config from "@marketing/lib/api/config";
import {
  fetchAuthContext,
  hasWorkosSessionCookie,
} from "@marketing/lib/api/authContext";
import { DUST_SKIP_LANDING, shouldSkipLanding } from "@marketing/lib/cookies";
import type { NewsItem } from "@marketing/lib/homepage_news";
import { fetchHomepageNews } from "@marketing/lib/homepage_news";
import { extractUTMParams } from "@marketing/lib/utils/utm";
import { Landing } from "@marketing/pages/home";
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

/**
 * Resolve where an already-authenticated visitor should be sent, server-side.
 *
 * Only called for visitors who opted into skipping the landing page; the caller
 * owns that gate.
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
  const authContext = await fetchAuthContext(cookieHeader, {
    failureLogMessage:
      "auth-context lookup failed during marketing root SSR; rendering landing",
  });
  if (!authContext) {
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
  const destinationUrl = authContext.defaultWorkspaceId
    ? `${config.getAppUrl()}/w/${authContext.defaultWorkspaceId}`
    : `${config.getApiBaseUrl()}/api/login`;
  return utmQueryString
    ? `${destinationUrl}?${utmQueryString}`
    : destinationUrl;
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async (
  context
) => {
  const { inviteToken } = context.query;

  // On the marketing root, redirect straight to the product only for visitors
  // who explicitly asked for it via the "Always open Dust" prompt. Everyone else
  // gets the landing page. Doing it server-side, before rendering, avoids the
  // render + hydrate + client fetch round-trip. The skip-preference check comes
  // first because it is a plain cookie lookup, which keeps the auth-context
  // round-trip off the path of every logged-in visitor who has not opted in. We
  // do NOT forward inviteToken: an expired/invalid one makes /api/login 400, and
  // the redirect intent doesn't depend on it.
  const cookieHeader = context.req.headers.cookie ?? "";
  if (
    shouldSkipLanding(context.req.cookies[DUST_SKIP_LANDING]) &&
    hasWorkosSessionCookie(cookieHeader)
  ) {
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
