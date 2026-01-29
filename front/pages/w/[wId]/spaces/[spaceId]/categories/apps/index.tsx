import { Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { SpaceAppsList } from "@app/components/spaces/SpaceAppsList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export const getServerSideProps = appGetServerSideProps;

function Space() {
  const router = useRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const owner = useWorkspace();
  const { subscription, isAdmin, isBuilder } = useAuth();
  const plan = subscription.plan;

  const {
    spaceInfo: space,
    canWriteInSpace,
    canReadInSpace,
    isSpaceInfoLoading,
  } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });

  if (isSpaceInfoLoading || !space) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const pageProps: SpaceLayoutPageProps = {
    canReadInSpace,
    canWriteInSpace,
    category: "apps",
    isAdmin,
    owner,
    plan,
    space,
    subscription,
  };

  return (
    <SpaceLayout pageProps={pageProps}>
      <SpaceAppsList
        owner={owner}
        space={space}
        isBuilder={isBuilder}
        onSelect={(sId) => {
          void router.push(`/w/${owner.sId}/spaces/${space.sId}/apps/${sId}`);
        }}
      />
    </SpaceLayout>
  );
}

const PageWithAuthLayout = Space as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
