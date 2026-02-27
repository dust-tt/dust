import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { Landing } from "@app/pages/home";
import type { ReactElement } from "react";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  postLoginReturnToUrl: string;
}>(async (context) => {
  const { inviteToken } = context.query;

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
