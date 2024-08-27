import { Page } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceViewCategory,
  PlanType,
  VaultType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import React from "react";

import { VaultDataSourceContentList } from "@app/components/vaults/VaultDataSourceContentList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceViewCategory;
    dataSource: DataSourceType;
    hasWritePermission: boolean;
    parentId?: string;
    vault: VaultType;
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

  const vault = await VaultResource.fetchById(
    auth,
    context.query.vaultId as string
  );
  if (!vault) {
    return {
      notFound: true,
    };
  }

  const { dataSourceId } = context.query;
  if (typeof dataSourceId !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSource = await DataSourceResource.fetchByName(auth, dataSourceId);
  if (!dataSource) {
    return {
      notFound: true,
    };
  }
  const hasWritePermission =
    auth.isBuilder() && auth.hasPermission([vault.acl()], "write");
  const parentId = context.query?.parentId as string | undefined;

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      dataSource: dataSource.toJSON(),
      gaTrackingId: config.getGaTrackingId(),
      hasWritePermission,
      owner,
      parentId,
      subscription,
      vault: vault.toJSON(),
      plan,
    },
  };
});

export default function Vault({
  dataSource,
  hasWritePermission,
  owner,
  plan,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <Page.Vertical gap="xl" align="stretch">
      <VaultDataSourceContentList
        owner={owner}
        hasWritePermission={hasWritePermission}
        dataSource={dataSource}
        plan={plan}
      />
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
