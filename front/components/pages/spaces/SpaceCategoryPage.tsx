import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

import type { DataSourceIntegration } from "@app/components/spaces/AddConnectionMenu";
import { SpaceResourcesList } from "@app/components/spaces/SpaceResourcesList";
import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  useAppRouter,
  useRequiredPathParam,
  useSearchParam,
} from "@app/lib/platform";
import {
  useSpaceDataSourceViews,
  useSpaceInfo,
  useSystemSpace,
} from "@app/lib/swr/spaces";
import { useWorkspaceSeatsCount } from "@app/lib/swr/workspaces";
import type {
  ConnectorProvider,
  DataSourceViewCategoryWithoutApps,
} from "@app/types";
import {
  CONNECTOR_PROVIDERS,
  isConnectorProvider,
  isDataSourceViewCategoryWithoutApps,
} from "@app/types";

export function SpaceCategoryPage() {
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const category = useRequiredPathParam("category");
  const setupWithSuffixConnector = useSearchParam("setupWithSuffixConnector");
  const setupWithSuffixSuffix = useSearchParam("setupWithSuffixSuffix");

  const owner = useWorkspace();
  const { subscription, isAdmin, user } = useAuth();
  const plan = subscription.plan;

  const {
    spaceInfo: space,
    canReadInSpace,
    canWriteInSpace,
    isSpaceInfoLoading,
  } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });

  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
  });

  const { seatsCount, isSeatsCountLoading } = useWorkspaceSeatsCount({
    workspaceId: owner.sId,
    disabled: !isAdmin,
  });

  // For system spaces, fetch managed data source views to compute available integrations
  const isSystemSpace = space?.kind === "system";
  const { spaceDataSourceViews, isSpaceDataSourceViewsLoading } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId,
      category: "managed",
      disabled: !isSystemSpace,
    });

  // Compute integrations for system spaces
  const integrations = useMemo((): DataSourceIntegration[] => {
    if (!isSystemSpace) {
      return [];
    }

    let setupWithSuffix: {
      connector: ConnectorProvider;
      suffix: string;
    } | null = null;

    if (
      setupWithSuffixConnector &&
      isConnectorProvider(setupWithSuffixConnector) &&
      setupWithSuffixSuffix
    ) {
      setupWithSuffix = {
        connector: setupWithSuffixConnector as ConnectorProvider,
        suffix: setupWithSuffixSuffix,
      };
    }

    const usedConnectorProviders = new Set(
      spaceDataSourceViews
        .map((dsv) => dsv.dataSource.connectorProvider)
        .filter((p): p is ConnectorProvider => p !== null)
    );

    const result: DataSourceIntegration[] = [];
    for (const connectorProvider of CONNECTOR_PROVIDERS) {
      if (
        !usedConnectorProviders.has(connectorProvider) ||
        setupWithSuffix?.connector === connectorProvider
      ) {
        result.push({
          connectorProvider,
          setupWithSuffix:
            setupWithSuffix?.connector === connectorProvider
              ? setupWithSuffix.suffix
              : null,
        });
      }
    }

    return result;
  }, [
    isSystemSpace,
    spaceDataSourceViews,
    setupWithSuffixConnector,
    setupWithSuffixSuffix,
  ]);

  const validCategory = isDataSourceViewCategoryWithoutApps(category)
    ? (category as DataSourceViewCategoryWithoutApps)
    : null;

  const isLoading =
    isSpaceInfoLoading ||
    isSystemSpaceLoading ||
    (isAdmin && isSeatsCountLoading) ||
    (isSystemSpace && isSpaceDataSourceViewsLoading);

  if (isLoading || !space || !systemSpace || !validCategory || !user) {
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
      dataSourceView={undefined}
      parentId={undefined}
      useBackendSearch
    >
      <SpaceResourcesList
        owner={owner}
        user={user}
        plan={plan}
        space={space}
        systemSpace={systemSpace}
        isAdmin={isAdmin}
        canWriteInSpace={canWriteInSpace}
        category={validCategory}
        integrations={integrations}
        activeSeats={seatsCount}
        onSelect={(sId) => {
          void router.push(
            `/w/${owner.sId}/spaces/${space.sId}/categories/${validCategory}/data_source_views/${sId}`
          );
        }}
      />
    </SpaceSearchInput>
  );
}
