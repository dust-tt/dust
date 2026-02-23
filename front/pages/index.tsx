import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import {
  getUserFromSession,
  makeGetServerSidePropsRequirementsWrapper,
} from "@app/lib/iam/session";
import { Landing } from "@app/pages/home";
import type { ReactElement } from "react";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  postLoginReturnToUrl: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  const { inviteToken } = context.query;

  // We keep redirecting to the app if user is authenticated and has workspaces.
  // This is to keep previous behavior and users using https://dust.tt ,
  // but we should consider keeping https://dust.tt as a landing page.
  if (user && user.workspaces.length > 0) {
    // Authenticated user: redirect to the SPA, forwarding query params.
    const queryString = new URLSearchParams(
      context.query as Record<string, string>
    ).toString();
    const baseUrl = config.getAppUrl(false);
    const destination = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    return {
      redirect: {
        destination,
        permanent: false,
      },
    };
  }

  // Unauthenticated user: show the landing page.
  let postLoginCallbackUrl = "/api/login";
  if (inviteToken) {
    postLoginCallbackUrl += `?inviteToken=${inviteToken}`;
  }

  return {
    props: {
      postLoginReturnToUrl: postLoginCallbackUrl,
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
});

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
