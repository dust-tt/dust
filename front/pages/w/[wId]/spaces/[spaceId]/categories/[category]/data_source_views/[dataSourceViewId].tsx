import { Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { SpaceDataSourceViewContentList } from "@app/components/spaces/SpaceDataSourceViewContentList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam, useSearchParam } from "@app/lib/platform";
import {
  useSpaceDataSourceView,
  useSpaceInfo,
  useSystemSpace,
} from "@app/lib/swr/spaces";
import type { DataSourceViewCategory } from "@app/types";
import { isValidDataSourceViewCategory } from "@app/types";

export const getServerSideProps = appGetServerSideProps;

function Space() {
  const router = useRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const dataSourceViewId = useRequiredPathParam("dataSourceViewId");
  const category = useRequiredPathParam("category");
  const parentId = useSearchParam("parentId");
  const owner = useWorkspace();
  const { subscription, isAdmin, user } = useAuth();
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

  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
  });

  const { dataSourceView, connector, isDataSourceViewLoading } =
    useSpaceDataSourceView({
      owner,
      spaceId,
      dataSourceViewId,
    });

  const validCategory = isValidDataSourceViewCategory(category)
    ? category
    : null;

  const isLoading =
    isSpaceInfoLoading || isSystemSpaceLoading || isDataSourceViewLoading;

  if (
    isLoading ||
    !space ||
    !systemSpace ||
    !validCategory ||
    !user ||
    !dataSourceView
  ) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const pageProps: SpaceLayoutPageProps = {
    canReadInSpace,
    canWriteInSpace,
    category: validCategory,
    isAdmin,
    owner,
    plan,
    space,
    subscription,
  };

  return (
    <SpaceLayout pageProps={pageProps} useBackendSearch>
      <SpaceDataSourceViewContentList
        owner={owner}
        space={space}
        plan={plan}
        canWriteInSpace={canWriteInSpace}
        canReadInSpace={canReadInSpace}
        parentId={parentId ?? undefined}
        dataSourceView={dataSourceView}
        onSelect={(selectedParentId) => {
          void router.push(
            `/w/${owner.sId}/spaces/${dataSourceView.spaceId}/categories/${validCategory}/data_source_views/${dataSourceView.sId}?parentId=${selectedParentId}`
          );
        }}
        isAdmin={isAdmin}
        systemSpace={systemSpace}
        connector={connector}
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
