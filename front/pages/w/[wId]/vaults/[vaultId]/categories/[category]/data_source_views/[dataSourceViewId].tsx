import { Page } from "@dust-tt/sparkle";
import type {
  ConnectorType,
  DataSourceType,
  DataSourceViewCategory,
  DataSourceViewType,
  VaultType,
} from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { VaultDataSourceViewContentList } from "@app/components/vaults/VaultDataSourceViewContentList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceViewCategory;
    dataSource: DataSourceType;
    dataSourceView: DataSourceViewType;
    canWriteInVault: boolean;
    canReadInVault: boolean;
    parentId?: string;
    systemVault: VaultType;
    connector: ConnectorType | null;
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
    dataSourceViewId,
    { includeEditedBy: true }
  );

  if (
    !dataSourceView ||
    dataSourceView.vault.sId !== vaultId ||
    !dataSourceView.canList(auth)
  ) {
    return {
      notFound: true,
    };
  }

  const systemVault = await VaultResource.fetchWorkspaceSystemVault(auth);
  const vault = dataSourceView.vault;
  const canWriteInVault = vault.canWrite(auth);
  const canReadInVault = vault.canRead(auth);

  let connector: ConnectorType | null = null;
  if (dataSourceView.dataSource.connectorId) {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.getConnector(
      dataSourceView.dataSource.connectorId
    );
    if (connectorRes.isOk()) {
      connector = connectorRes.value;
    }
  }

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      dataSource: dataSourceView.dataSource.toJSON(),
      dataSourceView: dataSourceView.toJSON(),
      isAdmin,
      canWriteInVault,
      canReadInVault,
      owner,
      // undefined is not allowed in the JSON response
      ...(parentId && { parentId }),
      plan,
      subscription,
      vault: vault.toJSON(),
      systemVault: systemVault.toJSON(),
      connector,
    },
  };
});

export default function Vault({
  vault,
  category,
  dataSourceView,
  canWriteInVault,
  canReadInVault,
  owner,
  parentId,
  plan,
  isAdmin,
  systemVault,
  connector,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <Page.Vertical gap="xl" align="stretch">
      <VaultDataSourceViewContentList
        owner={owner}
        vault={vault}
        plan={plan}
        canWriteInVault={canWriteInVault}
        canReadInVault={canReadInVault}
        parentId={parentId}
        dataSourceView={dataSourceView}
        onSelect={(parentId) => {
          void router.push(
            `/w/${owner.sId}/vaults/${dataSourceView.vaultId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${parentId}`
          );
        }}
        isAdmin={isAdmin}
        systemVault={systemVault}
        connector={connector}
      />
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
