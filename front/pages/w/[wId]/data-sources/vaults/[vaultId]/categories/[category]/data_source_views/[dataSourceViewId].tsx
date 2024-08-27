import { Page } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceViewCategory,
  DataSourceViewType,
  VaultType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React from "react";

import { VaultDataSourceViewContentList } from "@app/components/vaults/VaultDataSourceViewContentList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceViewCategory;
    dataSource: DataSourceType;
    dataSourceView: DataSourceViewType;
    isAdmin: boolean;
    parentId?: string;
    vault: VaultType;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();

  if (!subscription) {
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
  if (!dataSourceView || !dataSourceView.dataSource) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      dataSource: dataSourceView.dataSource.toJSON(),
      dataSourceView: dataSourceView.toJSON(),
      gaTrackingId: config.getGaTrackingId(),
      isAdmin,
      owner,
      // undefined is not allowed in the JSON response
      ...(parentId && { parentId }),
      subscription,
      vault: vault.toJSON(),
    },
  };
});

export default function Vault({
  category,
  dataSourceView,
  isAdmin,
  owner,
  parentId,
  vault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <Page.Vertical gap="xl" align="stretch">
      <VaultDataSourceViewContentList
        owner={owner}
        vault={vault}
        isAdmin={isAdmin}
        parentId={parentId}
        dataSourceView={dataSourceView}
        onSelect={(parentId) => {
          void router.push(
            `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${parentId}`
          );
        }}
      />
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
