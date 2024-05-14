import type { ReactElement } from "react";
import React from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { FutureSection } from "@app/components/home/content/Product/FutureSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import { TeamSection } from "@app/components/home/content/Product/TeamSection";
import { VerticalSection } from "@app/components/home/content/Product/VerticalSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  gaTrackingId: string;
  postLoginReturnToUrl: string;
}>(async (context) => {
  // Fetch session explicitly as this page redirects logged in users to our home page.
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  const { inviteToken } = context.query;

  if (user && user.workspaces.length > 0) {
    let url = `/w/${user.workspaces[0].sId}`;

    if (context.query.inviteToken) {
      url = `/api/login?inviteToken=${inviteToken}`;
    }

    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  }

  let postLoginCallbackUrl = "/api/login";
  if (inviteToken) {
    postLoginCallbackUrl += `?inviteToken=${inviteToken}`;
  }

  return {
    props: {
      gaTrackingId: config.getGaTrackingId(),
      postLoginReturnToUrl: postLoginCallbackUrl,
      shape: 0,
    },
  };
});

export default function Home() {
  return (
    <>
      <IntroSection />
      <TeamSection />
      <FutureSection />
      <BlogSection />
      <VerticalSection />
    </>
  );
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
