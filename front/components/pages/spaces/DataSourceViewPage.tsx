import { SpaceDataSourceViewContentList } from "@app/components/spaces/SpaceDataSourceViewContentList";
import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  useAppRouter,
  useRequiredPathParam,
  useSearchParam,
} from "@app/lib/platform";
import {
  useSpaceDataSourceView,
  useSpaceInfo,
  useSystemSpace,
} from "@app/lib/swr/spaces";
import { isValidDataSourceViewCategory } from "@app/types/api/public/spaces";
import { Spinner } from "@dust-tt/sparkle";

export function DataSourceViewPage() {
  const router = useAppRouter();
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

  return (
    <SpaceSearchInput
      category={validCategory}
      canReadInSpace={canReadInSpace}
      canWriteInSpace={canWriteInSpace}
      owner={owner}
      space={space}
      dataSourceView={dataSourceView}
      parentId={parentId ?? undefined}
      useBackendSearch
    >
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
    </SpaceSearchInput>
  );
}
