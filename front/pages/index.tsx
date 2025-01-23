import type { ReactElement } from "react";
import React from "react";

import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { getPersistedNavigationSelection } from "@app/lib/persisted_navigation_selection";
import { Landing } from "@app/pages/home";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  postLoginReturnToUrl: string;
}>(async (context) => {
  // Fetch session explicitly as this page redirects logged in users to our home page.
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  const { inviteToken } = context.query;

  if (user && user.workspaces.length > 0) {
    let url = `/w/${user.workspaces[0].sId}`;

    // Try to go to the last selected workspace.
    const selection = await getPersistedNavigationSelection(user);
    if (
      selection.lastWorkspaceId &&
      user.workspaces.find((w) => w.sId === selection.lastWorkspaceId)
    ) {
      url = `/w/${selection.lastWorkspaceId}`;
    }

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
      postLoginReturnToUrl: postLoginCallbackUrl,
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
});

export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
