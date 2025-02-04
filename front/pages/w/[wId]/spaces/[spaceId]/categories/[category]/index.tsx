import { CloudArrowLeftRightIcon, Page } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceViewCategory,
  DataSourceWithConnectorDetailsType,
  SpaceType,
} from "@dust-tt/types";
import {
  CONNECTOR_PROVIDERS,
  isConnectorProvider,
  removeNulls,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import type { DataSourceIntegration } from "@app/components/spaces/AddConnectionMenu";
import { SpaceAppsList } from "@app/components/spaces/SpaceAppsList";
import type { SpaceLayoutProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { SpaceResourcesList } from "@app/components/spaces/SpaceResourcesList";
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

export const getServerSideProps = withDefaultUserAuthRequirements<
  SpaceLayoutProps & {
    category: DataSourceViewCategory;
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

  const { spaceId } = context.query;

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

  const isBuilder = auth.isBuilder();
  const canWriteInSpace = space.canWrite(auth);

  const integrations: DataSourceIntegration[] = [];

  if (space.kind === "system") {
    let setupWithSuffix: {
      connector: ConnectorProvider;
      suffix: string;
    } | null = null;
    if (
      context.query.setupWithSuffixConnector &&
      isConnectorProvider(context.query.setupWithSuffixConnector as string) &&
      context.query.setupWithSuffixSuffix &&
      typeof context.query.setupWithSuffixSuffix === "string"
    ) {
      setupWithSuffix = {
        connector: context.query.setupWithSuffixConnector as ConnectorProvider,
        suffix: context.query.setupWithSuffixSuffix,
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
      category: context.query.category as DataSourceViewCategory,
      isAdmin,
      isBuilder,
      canWriteInSpace,
      owner,
      plan,
      subscription,
      space: space.toJSON(),
      systemSpace: systemSpace.toJSON(),
      integrations,
      registryApps,
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
  registryApps,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <Page.Vertical gap="xl" align="stretch">
      {space.kind === "system" && (
        <>
          <Page.Header
            title="Connection Admin"
            description={
              <>
                Here you can authorize Connections and control what data Dust
                can access. Once connected, data can be distributed to Open
                Spaces (accessible to all workspace members) or Restricted
                Spaces (limited access). <br />
                Need help? Check out our{" "}
                <Link
                  href="https://docs.dust.tt/docs/data"
                  className="text-highlight"
                  target="_blank"
                >
                  guide
                </Link>
              </>
            }
            icon={CloudArrowLeftRightIcon}
          />
        </>
      )}
      {category === "apps" ? (
        <SpaceAppsList
          owner={owner}
          space={space}
          canWriteInSpace={canWriteInSpace}
          onSelect={(sId) => {
            void router.push(`/w/${owner.sId}/spaces/${space.sId}/apps/${sId}`);
          }}
          registryApps={registryApps}
        />
      ) : (
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
      )}
    </Page.Vertical>
  );
}

Space.getLayout = (page: ReactElement, pageProps: any) => {
  return <SpaceLayout pageProps={pageProps}>{page}</SpaceLayout>;
};
