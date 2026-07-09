import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import config from "@marketing/lib/api/config";
import {
  fetchAuthContext,
  hasWorkosSessionCookie,
} from "@marketing/lib/api/authContext";
import { getServerFeatureFlagVariant } from "@marketing/lib/api/posthog_server";
import type { HeroVariantKey } from "@marketing/lib/experiments/hero_experiment";
import {
  HERO_EXPERIMENT_FLAG_KEY,
  isHeroVariantKey,
  toHeroVariant,
} from "@marketing/lib/experiments/hero_experiment";
import type { NewsItem } from "@marketing/lib/homepage_news";
import { fetchHomepageNews } from "@marketing/lib/homepage_news";
import {
  buildDustAidServerCookieString,
  readAnonymousIdFromCookies,
} from "@marketing/lib/utils/anonymous_id";
import { extractUTMParams } from "@marketing/lib/utils/utm";
import { Landing } from "@marketing/pages/home";
import logger from "@marketing/logger/logger";
import type { GetServerSideProps } from "next";
import type { ParsedUrlQuery } from "querystring";
import type { ReactElement } from "react";
import { v4 as uuidv4 } from "uuid";

interface HomeProps {
  postLoginReturnToUrl: string;
  news: NewsItem[];
  shape: number;
  gtmTrackingId: string | null;
  // Server-resolved hero A/B variant, rendered into the initial HTML so the
  // control copy never flashes to the test copy.
  heroVariant: HeroVariantKey;
  // Feature flags to seed posthog-js with, so the client agrees with the
  // server-rendered variant and can record the exposure without a re-fetch.
  // Null when flag evaluation was unavailable (client falls back to its own).
  posthogBootstrap: { featureFlags: Record<string, string> } | null;
}

/**
 * Resolve where an already-authenticated visitor should be sent, server-side.
 *
 * Mirrors the old `front` behaviour (`front/pages/index.tsx` `getServerSideProps`,
 * which called `getSession` and redirected before rendering).
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

  // On the marketing root, an authenticated user's intent is to open the
  // product, not browse the homepage — so redirect them server-side, before
  // rendering, to avoid the render + hydrate + client fetch round-trip. Gated on
  // the session cookie so anonymous SSR stays a no-op. We do NOT forward
  // inviteToken: an expired/invalid one makes /api/login 400, and the redirect
  // intent doesn't depend on it.
  const cookieHeader = context.req.headers.cookie ?? "";
  if (hasWorkosSessionCookie(cookieHeader)) {
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

  // Resolve the PostHog distinct id from the persistent `_dust_aid` cookie so
  // the server buckets the hero experiment identically to the client. On a
  // visitor's very first request the cookie doesn't exist yet, so mint one here
  // and set it on the response — otherwise the flag would be evaluated against a
  // throwaway id and diverge from the client, reintroducing the flash we set out
  // to avoid.
  let distinctId = readAnonymousIdFromCookies(cookieHeader);
  if (!distinctId) {
    distinctId = uuidv4();
    context.res.setHeader(
      "Set-Cookie",
      buildDustAidServerCookieString(distinctId, context.req.headers.host)
    );
  }

  const [news, heroFlagValue] = await Promise.all([
    fetchHomepageNews(),
    getServerFeatureFlagVariant(HERO_EXPERIMENT_FLAG_KEY, distinctId),
  ]);

  let heroVariant = toHeroVariant(heroFlagValue);
  // Only bootstrap the client when evaluation actually succeeded; on failure we
  // rendered control and let posthog-js resolve the flag on its own.
  let posthogBootstrap: { featureFlags: Record<string, string> } | null =
    heroFlagValue === undefined
      ? null
      : { featureFlags: { [HERO_EXPERIMENT_FLAG_KEY]: heroVariant } };

  // Dev-only override to preview a specific hero variant without a live PostHog
  // experiment, e.g. `/?hero_variant=collaboration`. Never honored in
  // production, where the variant must come from the real experiment.
  if (config.getNodeEnv() !== "production") {
    const requested = context.query.hero_variant;
    const requestedValue = Array.isArray(requested) ? requested[0] : requested;
    if (isHeroVariantKey(requestedValue)) {
      heroVariant = requestedValue;
      posthogBootstrap = {
        featureFlags: { [HERO_EXPERIMENT_FLAG_KEY]: requestedValue },
      };
    }
  }

  return {
    props: {
      postLoginReturnToUrl: postLoginCallbackUrl,
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      news,
      heroVariant,
      posthogBootstrap,
    },
  };
};

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Home({ news, heroVariant }: HomeProps) {
  return <Landing news={news} heroVariant={heroVariant} />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
