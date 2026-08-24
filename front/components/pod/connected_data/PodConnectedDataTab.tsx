import { SpaceDataSourceViewContentList } from "@app/components/spaces/SpaceDataSourceViewContentList";
import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { SpaceResourcesList } from "@app/components/spaces/SpaceResourcesList";
import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useAuth } from "@app/lib/auth/AuthContext";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useSpaceDataSourceView, useSystemSpace } from "@app/lib/swr/spaces";
import { useWorkspaceSeatsCount } from "@app/lib/swr/workspaces";
import { getPodRoute } from "@app/lib/utils/router";
import type { RichSpaceType } from "@app/types/api/spaces";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { WorkspaceType } from "@app/types/user";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import type { BreadcrumbsItem } from "@dust-tt/sparkle";
import { Breadcrumbs, CloudArrowLeftRight, Spinner } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

// Module-level so the reference passed to `useQueryParams` stays stable.
const POD_CONNECTED_DATA_PARAMS = ["dsvId", "parentId", "q"] as const;

interface PodConnectedDataTabProps {
  owner: WorkspaceType;
  pod: RichSpaceType;
}

function podConnectedDataHref(
  owner: WorkspaceType,
  podId: string,
  params?: { dsvId?: string; parentId?: string }
): string {
  const search = new URLSearchParams();
  if (params?.dsvId) {
    search.set("dsvId", params.dsvId);
  }
  if (params?.parentId) {
    search.set("parentId", params.parentId);
  }
  const qs = search.toString();
  const path = getPodRoute(owner.sId, podId);
  return qs ? `${path}?${qs}#connected_data` : `${path}#connected_data`;
}

function PodConnectedDataBreadcrumbs({
  owner,
  pod,
  dataSourceView,
  parentId,
}: {
  owner: WorkspaceType;
  pod: RichSpaceType;
  dataSourceView?: DataSourceViewType;
  parentId?: string;
}) {
  const {
    nodes: [currentNavigationItem],
  } = useDataSourceViewContentNodes({
    owner,
    dataSourceView: parentId ? dataSourceView : undefined,
    internalIds: parentId ? [parentId] : [],
    viewType: "all",
  });

  const { nodes: folders } = useDataSourceViewContentNodes({
    dataSourceView: currentNavigationItem ? dataSourceView : undefined,
    internalIds: currentNavigationItem?.parentInternalIds ?? [],
    owner,
    viewType: "all",
  });

  const items = useMemo((): BreadcrumbsItem[] => {
    if (!dataSourceView) {
      return [
        {
          icon: CloudArrowLeftRight,
          label: "Connected Data",
        },
      ];
    }

    const crumbs: BreadcrumbsItem[] = [
      {
        icon: CloudArrowLeftRight,
        label: "Connected Data",
        href: podConnectedDataHref(owner, pod.sId),
      },
      {
        label: getDataSourceNameFromView(dataSourceView),
        href: podConnectedDataHref(owner, pod.sId, {
          dsvId: dataSourceView.sId,
        }),
      },
    ];

    for (const node of [...folders].reverse()) {
      crumbs.push({
        label: node.title,
        href: podConnectedDataHref(owner, pod.sId, {
          dsvId: dataSourceView.sId,
          parentId: node.internalId,
        }),
      });
    }

    return crumbs;
  }, [owner, pod, dataSourceView, folders]);

  return (
    <div className="flex h-9 w-full items-center justify-between gap-2">
      <Breadcrumbs items={items} />
      <div id={ACTION_BUTTONS_CONTAINER_ID} className="flex gap-2" />
    </div>
  );
}

/**
 * Connected Data for admin-controlled Pods — same managed-category UI as Spaces
 * ({@link SpaceResourcesList} + {@link SpaceSearchInput}), kept inside the Pod.
 */
export function PodConnectedDataTab({ owner, pod }: PodConnectedDataTabProps) {
  const { subscription, isAdmin, user } = useAuth();
  const plan = subscription.plan;

  const { dsvId, parentId, setParams } = useQueryParams([
    ...POD_CONNECTED_DATA_PARAMS,
  ]);

  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
  });

  const { seatsCount, isSeatsCountLoading } = useWorkspaceSeatsCount({
    workspaceId: owner.sId,
    disabled: !isAdmin,
  });

  const selectedDsvId = dsvId.value;
  const selectedParentId = parentId.value;

  const { dataSourceView, connector, isDataSourceViewLoading } =
    useSpaceDataSourceView({
      owner,
      spaceId: pod.sId,
      dataSourceViewId: selectedDsvId ?? null,
      disabled: !selectedDsvId,
    });

  const navigateToDataSourceView = useCallback(
    (sId: string, nextParentId?: string) => {
      setParams({
        dsvId: sId,
        parentId: nextParentId,
        q: undefined,
      });
    },
    [setParams]
  );

  const handleNavigateToSearchResult = useCallback(
    (node: DataSourceViewContentNode) => {
      const dsvSId = node.dataSourceView.sId;
      const nextParentId =
        node.mimeType === DATA_SOURCE_MIME_TYPE ? undefined : node.internalId;
      navigateToDataSourceView(dsvSId, nextParentId);
    },
    [navigateToDataSourceView]
  );

  if (
    isSystemSpaceLoading ||
    (isAdmin && isSeatsCountLoading) ||
    !systemSpace ||
    !user
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const showContentList = Boolean(selectedDsvId);
  if (showContentList && (isDataSourceViewLoading || !dataSourceView)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const activeDataSourceView = showContentList ? dataSourceView : undefined;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col py-8">
        <SpaceSearchInput
          category="managed"
          canReadInSpace={pod.canRead}
          canWriteInSpace={pod.canWrite}
          owner={owner}
          space={pod}
          dataSourceView={activeDataSourceView}
          parentId={selectedParentId}
          useBackendSearch
          header={
            <div className="pt-2">
              <PodConnectedDataBreadcrumbs
                owner={owner}
                pod={pod}
                dataSourceView={activeDataSourceView}
                parentId={selectedParentId}
              />
            </div>
          }
          onNavigateToSearchResult={handleNavigateToSearchResult}
        >
          {showContentList && dataSourceView ? (
            <SpaceDataSourceViewContentList
              key={`${dataSourceView.sId}:${selectedParentId ?? ""}`}
              owner={owner}
              space={pod}
              plan={plan}
              canWriteInSpace={pod.canWrite}
              canReadInSpace={pod.canRead}
              parentId={selectedParentId}
              dataSourceView={dataSourceView}
              onSelect={(nextParentId) => {
                navigateToDataSourceView(dataSourceView.sId, nextParentId);
              }}
              isAdmin={isAdmin}
              systemSpace={systemSpace}
              connector={connector}
            />
          ) : (
            <SpaceResourcesList
              owner={owner}
              user={user}
              plan={plan}
              space={pod}
              systemSpace={systemSpace}
              isAdmin={isAdmin}
              canWriteInSpace={pod.canWrite}
              category="managed"
              integrations={[]}
              activeSeats={seatsCount}
              onSelect={(sId) => {
                navigateToDataSourceView(sId);
              }}
            />
          )}
        </SpaceSearchInput>
      </div>
    </div>
  );
}
