import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import config from "@marketing/lib/api/config";
import type { NewsItem } from "@marketing/lib/homepage_news";
import { fetchHomepageNews } from "@marketing/lib/homepage_news";
import { extractUTMParams } from "@marketing/lib/utils/utm";
import { Landing } from "@marketing/pages/home";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useEffect } from "react";

interface HomeProps {
  postLoginReturnToUrl: string;
  news: NewsItem[];
  shape: number;
  gtmTrackingId: string | null;
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async (
  context
) => {
  const { inviteToken } = context.query;

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

/**
 * Client-side redirect for already-authenticated visitors landing on the
 * marketing root: an authed user's intent is to open the product, not browse
 * the homepage. We forward only marketing/attribution params (UTM + click IDs)
 * so /api/login keeps signup attribution.
 */
function useRedirectAuthedToApp() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${config.getApiBaseUrl()}/api/auth-context`, {
          credentials: "include",
        });
        if (cancelled || !res.ok) {
          return;
        }
        const data = (await res.json()) as { user?: { sId?: string } };
        if (!data.user) {
          return;
        }

        const utmSearchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(
          extractUTMParams(router.query)
        )) {
          if (value) {
            utmSearchParams.set(key, value);
          }
        }
        const utmQueryString = utmSearchParams.toString();
        const loginUrl = `${config.getApiBaseUrl()}/api/login`;
        window.location.replace(
          utmQueryString ? `${loginUrl}?${utmQueryString}` : loginUrl
        );
      } catch {
        // Not authenticated or fetch failed — stay on landing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.query]);
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Home({ news }: HomeProps) {
  useRedirectAuthedToApp();
  return <Landing news={news} />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
