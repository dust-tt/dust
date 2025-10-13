import type { ReactElement } from "react";

import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import { getSession } from "@app/lib/auth";
import {
  getUserFromSession,
  makeGetServerSidePropsRequirementsWrapper,
} from "@app/lib/iam/session";
import { getPersistedNavigationSelection } from "@app/lib/persisted_navigation_selection";
import { UserResource } from "@app/lib/resources/user_resource";
import { extractUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { Landing } from "@app/pages/home";
import { isString } from "@app/types/shared/utils/general";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  postLoginReturnToUrl: string;
}>(async (context) => {
  // Fetch session explicitly as this page redirects logged in users to our home page.
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const organizationId = session?.organizationId;
  const currentRegion = multiRegionsConfig.getCurrentRegion();

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

    if (organizationId) {
      const organization = user.organizations?.find(
        (o) => o.id === organizationId
      );
      if (organization && organization.metadata.region === currentRegion) {
        url = `/w/${organization.externalId}`;
      }
    }

    // This allows linking to the workspace subscription page from the documentation.
    if (context.query.goto === "subscription") {
      url = url + "/subscription/manage";
    }

    // This allows linking to the assistant template creation page from external sources.
    const { goto, templateId } = context.query;
    if (goto === "template" && isString(templateId)) {
      url = url + `/builder/agents/create?templateId=${templateId}`;
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
  } else if (session?.region) {
    // User does not exist in this region but they have a cookie - checking if we need to redirect
    const targetRegion = session.region;

    if (targetRegion && targetRegion !== currentRegion) {
      logger.info(
        {
          targetRegion,
          currentRegion,
        },
        "Redirecting to correct region"
      );
      const targetRegionInfo = multiRegionsConfig.getOtherRegionInfo();
      return {
        redirect: {
          destination: targetRegionInfo.url,
          permanent: false,
        },
      };
    }
  }

  let postLoginCallbackUrl = "/api/login";
  if (inviteToken) {
    postLoginCallbackUrl += `?inviteToken=${inviteToken}`;
  }

  // Extract UTM parameters from query string
  const utmParams = extractUTMParams(context.query);

  return {
    props: {
      postLoginReturnToUrl: postLoginCallbackUrl,
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      utmParams,
    },
  };
});

export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
