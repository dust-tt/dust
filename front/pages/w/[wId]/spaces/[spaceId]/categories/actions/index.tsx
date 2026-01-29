import { Spinner } from "@dust-tt/sparkle";
import type { ReactElement } from "react";

import { SpaceActionsList } from "@app/components/spaces/SpaceActionsList";
import { SpaceLayoutWrapper } from "@app/components/spaces/SpaceLayout";
import { SystemSpaceActionsList } from "@app/components/spaces/SystemSpaceActionsList";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export const getServerSideProps = appGetServerSideProps;

function Space() {
  const spaceId = useRequiredPathParam("spaceId");
  const owner = useWorkspace();
  const { isAdmin, user } = useAuth();

  const { spaceInfo: space, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });

  if (isSpaceInfoLoading || !space || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (space.kind === "system") {
    return (
      <SystemSpaceActionsList
        isAdmin={isAdmin}
        owner={owner}
        user={user}
        space={space}
      />
    );
  }

  return <SpaceActionsList isAdmin={isAdmin} owner={owner} space={space} />;
}

const PageWithAuthLayout = Space as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>
      <SpaceLayoutWrapper>{page}</SpaceLayoutWrapper>
    </AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
