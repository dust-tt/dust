import type {
  ConnectorProvider,
  DataSourceViewCategory,
  DataSourceWithConnectorDetailsType,
  SpaceType,
} from "@dust-tt/types";
import {
  CONNECTOR_PROVIDERS,
  isConnectorProvider,
  isDataSourceViewCategoryWithoutApps,
  removeNulls,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import type { DataSourceIntegration } from "@app/components/spaces/AddConnectionMenu";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import {
  SpaceResourcesList,
  SpaceResourcesListActionButtons,
} from "@app/components/spaces/SpaceResourcesList";
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

type DataSourceViewCategoryWithoutApps = Exclude<
  DataSourceViewCategory,
  "apps"
>;

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
  const isSystemSpace = pageProps.space.kind === "system";
  const pageDescription = isSystemSpace ? (
    <>
      Here you can authorize Connections and control what data Dust can access.
      Once connected, data can be distributed to Open Spaces (accessible to all
      workspace members) or Restricted Spaces (limited access). <br />
      Need help? Check out our{" "}
      <Link
        href="https://docs.dust.tt/docs/data"
        className="text-highlight"
        target="_blank"
      >
        guide
      </Link>
    </>
  ) : undefined;
  const pageTitle = isSystemSpace ? "Connection Admin" : pageProps.category;

  return (
    <SpaceLayout
      hideHeader={!isSystemSpace}
      pageProps={pageProps}
      pageDescription={pageDescription}
      pageTitle={pageTitle}
      actionButtons={<SpaceResourcesListActionButtons {...pageProps} />}
    >
      {page}
    </SpaceLayout>
  );
};
