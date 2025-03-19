import type { ReactElement } from "react";
import React from "react";

import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { getPersistedNavigationSelection } from "@app/lib/persisted_navigation_selection";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
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

    // We get the UserResource from the session userId.
    // Temporary, as we'd need to refactor the getUserFromSession method
    // to return the UserResource instead of a UserTypeWithWorkspace.
    const u = await UserResource.fetchByModelId(user.id);

    // Should never happen. If it does (would be weird), we redirect to the home page.
    if (!u) {
      logger.error({ userId: user.id }, "Unreachable: user not found.");
      return {
        redirect: {
          destination: "/",
          permanent: false,
        },
      };
    }

    // Try to go to the last selected workspace.
    const selection = await getPersistedNavigationSelection(u);
    if (
      selection.lastWorkspaceId &&
      user.workspaces.find((w) => w.sId === selection.lastWorkspaceId)
    ) {
      url = `/w/${selection.lastWorkspaceId}`;
    }

    // This allows linking to the workspace subscription page from the documentation.
    if (context.query.goto === "subscription") {
      url = url + "/subscription/manage";
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
