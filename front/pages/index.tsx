import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getSession } from "@app/lib/auth";
import type { NewsItem } from "@app/lib/homepage_news";
import { fetchHomepageNews } from "@app/lib/homepage_news";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
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

  // The root marketing page is the one place where an authenticated user's intent when typing
  // "dust.tt" is overwhelmingly to open the product, not to browse the homepage. If they have a
  // valid session, send them straight into the app via /api/login (which resolves the target
  // workspace). Marketing sub-pages (/pricing, /security, /resources/..., etc.) are separate routes
  // and are intentionally left untouched so they stay accessible to logged-in users.
  const session = await getSession(context.req, context.res);
  if (session) {
    const queryIndex = context.resolvedUrl.indexOf("?");
    const queryString =
      queryIndex >= 0 ? context.resolvedUrl.slice(queryIndex) : "";

    return {
      redirect: {
        permanent: false,
        destination: `/api/login${queryString}`,
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
