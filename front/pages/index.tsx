import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getSession } from "@app/lib/auth";
import type { NewsItem } from "@app/lib/homepage_news";
import { fetchHomepageNews } from "@app/lib/homepage_news";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { extractUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { Landing } from "@app/pages/home";
import type { ReactElement } from "react";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  postLoginReturnToUrl: string;
  news: NewsItem[];
}>(async (context) => {
  const { inviteToken } = context.query;

  // On the marketing root, an authenticated user's intent is to open the product, not browse the
  // homepage. Send them into the app via /api/login (which resolves the target workspace). Marketing
  // sub-pages (/pricing, /security, /resources/...) are separate routes, left untouched.
  //
  // We forward only marketing/attribution params (UTM + click IDs) so /api/login keeps signup
  // attribution, which the client-rendered landing would otherwise have carried over. We do NOT
  // forward inviteToken: an expired/invalid one makes /api/login return a 400, which would turn the
  // bare root into an error wall, and the redirect intent doesn't depend on it.
  const session = await getSession(context.req, context.res);
  if (session) {
    const utmSearchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(
      extractUTMParams(context.query)
    )) {
      if (value) {
        utmSearchParams.set(key, value);
      }
    }
    const utmQueryString = utmSearchParams.toString();

    // Log a static path: context.resolvedUrl carries the query string, which can include sensitive
    // params like inviteToken.
    logger.info(
      { path: "/" },
      "Redirecting authenticated user from marketing root to the app"
    );

    return {
      redirect: {
        permanent: false,
        destination: utmQueryString
          ? `/api/login?${utmQueryString}`
          : "/api/login",
      },
    };
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
});

interface HomeProps {
  news: NewsItem[];
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Home({ news }: HomeProps) {
  return <Landing news={news} />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
