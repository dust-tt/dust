import { Page } from "@dust-tt/sparkle";
import type {
  ConnectorConfiguration,
  DataSourceType,
  DataSourceViewCategory,
  DataSourceViewType,
  PlanType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React from "react";

import { VaultDataSourceViewContentList } from "@app/components/vaults/VaultDataSourceViewContentList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { augmentDataSourceWithConnectorDetails } from "@app/lib/api/data_sources";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceViewCategory;
    dataSource: DataSourceType;
    dataSourceView: DataSourceViewType;
    connectorConfiguration: ConnectorConfiguration | null;
    isAdmin: boolean;
    parentId?: string;
    plan: PlanType;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const plan = auth.plan();

  if (!subscription || !plan) {
    return {
      notFound: true,
    };
  }

  const { vaultId } = context.query;
  if (typeof vaultId !== "string") {
    return {
      notFound: true,
    };
  }

  const { dataSourceViewId } = context.query;
  if (typeof dataSourceViewId !== "string") {
    return {
      notFound: true,
    };
  }
  const isAdmin = auth.isAdmin();
  const parentId = context.query?.parentId as string | undefined;

  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    dataSourceViewId
  );
  if (
    !dataSourceView ||
    dataSourceView.vault.sId !== vaultId ||
    !dataSourceView.canRead(auth)
  ) {
    return {
      notFound: true,
    };
  }

  const dataSource = dataSourceView.dataSource.toJSON();
  let connectorConfiguration: ConnectorConfiguration | null = null;
  if (isManaged(dataSource) || isWebsite(dataSource)) {
    const augmentedDataSource =
      await augmentDataSourceWithConnectorDetails(dataSource);
    if (augmentedDataSource && augmentedDataSource.connector?.configuration) {
      connectorConfiguration = augmentedDataSource.connector.configuration;
    }
  }

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      dataSource: dataSourceView.dataSource.toJSON(),
      dataSourceView: dataSourceView.toJSON(),
      connectorConfiguration,
      gaTrackingId: config.getGaTrackingId(),
      isAdmin,
      owner,
      // undefined is not allowed in the JSON response
      ...(parentId && { parentId }),
      plan,
      subscription,
      vault: dataSourceView.vault.toJSON(),
    },
  };
});

export default function Vault({
  vault,
  category,
  dataSourceView,
  connectorConfiguration,
  isAdmin,
  owner,
  parentId,
  plan,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <Page.Vertical gap="xl" align="stretch">
      <VaultDataSourceViewContentList
        owner={owner}
        vault={vault}
        plan={plan}
        isAdmin={isAdmin}
        parentId={parentId}
        dataSourceView={dataSourceView}
        connectorConfiguration={connectorConfiguration}
        onSelect={(parentId) => {
          void router.push(
            `/w/${owner.sId}/data-sources/vaults/${dataSourceView.vaultId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${parentId}`
          );
        }}
      />
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
