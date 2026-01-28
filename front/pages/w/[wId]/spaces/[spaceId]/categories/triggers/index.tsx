import { Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { SpaceTriggersList } from "@app/components/spaces/SpaceTriggersList";
import { SystemSpaceTriggersList } from "@app/components/spaces/SystemSpaceTriggersList";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { isString } from "@app/types";

export const getServerSideProps = appGetServerSideProps;

function Space() {
  const router = useRouter();
  const { spaceId } = router.query;
  const owner = useWorkspace();
  const { subscription, isAdmin, isBuilder, user } = useAuth();
  const plan = subscription.plan;

  const {
    spaceInfo: space,
    canWriteInSpace,
    canReadInSpace,
    isSpaceInfoLoading,
  } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: isString(spaceId) ? spaceId : null,
  });

  if (isSpaceInfoLoading || !space || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const pageProps: SpaceLayoutPageProps = {
    canReadInSpace,
    canWriteInSpace,
    category: "triggers",
    isAdmin,
    owner,
    plan,
    space,
    subscription,
  };

  const content =
    space.kind === "system" ? (
      <SystemSpaceTriggersList
        isAdmin={isAdmin}
        owner={owner}
        space={space}
        user={user}
      />
    ) : (
      <SpaceTriggersList owner={owner} space={space} />
    );

  return <SpaceLayout pageProps={pageProps}>{content}</SpaceLayout>;
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
