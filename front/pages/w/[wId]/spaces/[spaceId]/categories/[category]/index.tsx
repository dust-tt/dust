import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import type { DataSourceIntegration } from "@app/components/spaces/AddConnectionMenu";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { SpaceResourcesList } from "@app/components/spaces/SpaceResourcesList";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import config from "@app/lib/api/config";
import {
  augmentDataSourceWithConnectorDetails,
  getDataSources,
} from "@app/lib/api/data_sources";
import { isManaged } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { ActionApp } from "@app/lib/registry";
import { getDustProdActionRegistry } from "@app/lib/registry";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  ConnectorProvider,
  DataSourceViewCategoryWithoutApps,
  DataSourceWithConnectorDetailsType,
  SpaceType,
} from "@app/types";
import {
  CONNECTOR_PROVIDERS,
  isConnectorProvider,
  isDataSourceViewCategoryWithoutApps,
  removeNulls,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<
  SpaceLayoutPageProps & {
    category: DataSourceViewCategoryWithoutApps;
    isAdmin: boolean;
    canWriteInSpace: boolean;
    space: SpaceType;
    systemSpace: SpaceType;
    integrations: DataSourceIntegration[];
    registryApps: ActionApp[] | null;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const plan = auth.getNonNullablePlan();
  const isAdmin = auth.isAdmin();

  const { category, setupWithSuffixConnector, setupWithSuffixSuffix, spaceId } =
    context.query;

  if (!subscription || typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !systemSpace || !space.canReadOrAdministrate(auth)) {
    return {
      notFound: true,
    };
  }

  if (!isDataSourceViewCategoryWithoutApps(category)) {
    return {
      notFound: true,
    };
  }

  const isBuilder = auth.isBuilder();
  const canWriteInSpace = space.canWrite(auth);

  const integrations: DataSourceIntegration[] = [];

  if (space.isSystem()) {
    let setupWithSuffix: {
      connector: ConnectorProvider;
      suffix: string;
    } | null = null;
    if (
      setupWithSuffixConnector &&
      isConnectorProvider(setupWithSuffixConnector as string) &&
      setupWithSuffixSuffix &&
      typeof setupWithSuffixSuffix === "string"
    ) {
      setupWithSuffix = {
        connector: setupWithSuffixConnector as ConnectorProvider,
        suffix: setupWithSuffixSuffix,
      };
    }

    const allDataSources = await getDataSources(auth, {
      includeEditedBy: true,
    });

    const managedDataSources: DataSourceWithConnectorDetailsType[] =
      removeNulls(
        await Promise.all(
          allDataSources.map(async (managedDataSource) => {
            const ds = managedDataSource.toJSON();
            if (!isManaged(ds)) {
              return null;
            }
            const augmentedDataSource =
              await augmentDataSourceWithConnectorDetails(ds);

            return augmentedDataSource;
          })
        )
      );
    for (const connectorProvider of CONNECTOR_PROVIDERS) {
      if (
        !managedDataSources.find(
          (i) => i.connectorProvider === connectorProvider
        ) ||
        setupWithSuffix?.connector === connectorProvider
      ) {
        integrations.push({
          connectorProvider: connectorProvider,
          setupWithSuffix:
            setupWithSuffix?.connector === connectorProvider
              ? setupWithSuffix.suffix
              : null,
        });
      }
    }
  }

  const isDustAppsSpace =
    owner.sId === config.getDustAppsWorkspaceId() &&
    space.sId === config.getDustAppsSpaceId();

  const registryApps = isDustAppsSpace
    ? Object.values(getDustProdActionRegistry()).map((action) => action.app)
    : null;

  return {
    props: {
      canReadInSpace: space.canRead(auth),
      canWriteInSpace,
      category,
      integrations,
      isAdmin,
      isBuilder,
      owner,
      plan,
      registryApps,
      space: space.toJSON(),
      subscription,
      systemSpace: systemSpace.toJSON(),
    },
  };
});

export default function Space({
  category,
  isAdmin,
  canWriteInSpace,
  owner,
  plan,
  space,
  systemSpace,
  integrations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <SpaceResourcesList
      owner={owner}
      plan={plan}
      space={space}
      systemSpace={systemSpace}
      isAdmin={isAdmin}
      canWriteInSpace={canWriteInSpace}
      category={category}
      integrations={integrations}
      onSelect={(sId) => {
        void router.push(
          `/w/${owner.sId}/spaces/${space.sId}/categories/${category}/data_source_views/${sId}`
        );
      }}
    />
  );
}

Space.getLayout = (page: ReactElement, pageProps: any) => {
  return (
    <AppRootLayout>
      <SpaceLayout pageProps={pageProps} useBackendSearch>
        {page}
      </SpaceLayout>
    </AppRootLayout>
  );
};
