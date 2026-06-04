import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getSession } from "@app/lib/auth";
import type { NewsItem } from "@app/lib/homepage_news";
import { fetchHomepageNews } from "@app/lib/homepage_news";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
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
  // We don't forward the query string: the only params /api/login reads here is inviteToken, and an
  // expired/invalid token makes it return a 400, which would turn the bare root into an error wall.
  // The "open the product" intent doesn't depend on any param, so a plain redirect is safer.
  const session = await getSession(context.req, context.res);
  if (session) {
    logger.info(
      { path: context.resolvedUrl },
      "Redirecting authenticated user from marketing root to the app"
    );

    return {
      redirect: {
        permanent: false,
        destination: "/api/login",
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
