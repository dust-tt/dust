import { FolderIcon, LockIcon, Page, PlanetIcon } from "@dust-tt/sparkle";
import type {
  DataSourceOrViewCategory,
  DataSourceType,
  PlanType,
  VaultType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import React from "react";

import { BreadCrumb } from "@app/components/vaults/Breadcrumb";
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import { VaultDataSourceContentList } from "@app/components/vaults/VaultDataSourceContentList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceOrViewCategory;
    dataSource: DataSourceType;
    hasWritePermission: boolean;
    parentId: string | null;
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
  const parentId = context.query?.parentId as string;

  return {
    props: {
      category: context.query.category as DataSourceOrViewCategory,
      dataSource: dataSource.toJSON(),
      gaTrackingId: config.getGaTrackingId(),
      hasWritePermission,
      owner,
      parentId: parentId || null,
      subscription,
      vault: vault.toJSON(),
      plan,
    },
  };
});

export default function Vault({
  category,
  dataSource,
  hasWritePermission,
  owner,
  vault,
  plan,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
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
            label: CATEGORY_DETAILS[category].label,
            icon: CATEGORY_DETAILS[category].icon,
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
            href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source/${dataSource.name}`,
          },
        ]}
      />
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
