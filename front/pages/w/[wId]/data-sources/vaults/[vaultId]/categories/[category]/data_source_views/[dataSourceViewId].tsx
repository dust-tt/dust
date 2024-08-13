import { FolderIcon, LockIcon, Page, PlanetIcon } from "@dust-tt/sparkle";
import type {
  DataSourceOrViewCategory,
  DataSourceType,
  DataSourceViewType,
  VaultType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React from "react";

import { BreadCrumb } from "@app/components/vaults/Breadcrumb";
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import { VaultDataSourceViewContentList } from "@app/components/vaults/VaultDataSourceViewContentList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceOrViewCategory;
    dataSource: DataSourceType;
    dataSourceView: DataSourceViewType;
    isAdmin: boolean;
    parentId: string | null;
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
  const parentId = context.query?.parentId as string;

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
      category: context.query.category as DataSourceOrViewCategory,
      dataSource: dataSourceView.dataSource.toJSON(),
      dataSourceView: dataSourceView.toJSON(),
      gaTrackingId: config.getGaTrackingId(),
      isAdmin,
      owner,
      parentId: parentId || null,
      subscription,
      vault: vault.toJSON(),
    },
  };
});

export default function Vault({
  category,
  dataSource,
  dataSourceView,
  isAdmin,
  owner,
  parentId,
  vault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <Page.Vertical gap="xl" align="stretch">
      <BreadCrumb
        items={[
          {
            icon:
              vault.kind === "global" ? (
                <PlanetIcon className="text-brand" />
              ) : (
                <LockIcon className="text-brand" />
              ),
            label: vault.name,
            href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}`,
          },
          {
            icon: CATEGORY_DETAILS[category].icon,
            label: CATEGORY_DETAILS.managed.label,
            href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}`,
          },
          {
            icon: dataSource.connectorProvider ? (
              React.createElement(
                CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider]
                  .logoComponent
              )
            ) : (
              <FolderIcon className="text-brand" />
            ),
            label: dataSource.connectorProvider
              ? CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].name
              : dataSource.name,
            href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${dataSourceView.sId}`,
          },
          {
            label: "...",
          },
        ]}
      />

      <VaultDataSourceViewContentList
        owner={owner}
        vault={vault}
        isAdmin={isAdmin}
        parentId={parentId}
        dataSourceViewId={dataSourceView.sId}
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
