import { CloudArrowLeftRightIcon, Page } from "@dust-tt/sparkle";
import type {
  ConnectorProvider,
  DataSourceViewCategory,
  DataSourceWithConnectorDetailsType,
  VaultType,
} from "@dust-tt/types";
import {
  CONNECTOR_PROVIDERS,
  isConnectorProvider,
  removeNulls,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import type { DataSourceIntegration } from "@app/components/vaults/AddConnectionMenu";
import { VaultAppsList } from "@app/components/vaults/VaultAppsList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import { VaultResourcesList } from "@app/components/vaults/VaultResourcesList";
import {
  augmentDataSourceWithConnectorDetails,
  getDataSources,
} from "@app/lib/api/data_sources";
import { isManaged } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceViewCategory;
    isAdmin: boolean;
    canWriteInVault: boolean;
    vault: VaultType;
    systemVault: VaultType;
    integrations: DataSourceIntegration[];
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const plan = auth.getNonNullablePlan();
  const isAdmin = auth.isAdmin();

  if (!subscription) {
    return {
      notFound: true,
    };
  }

  const systemVault = await VaultResource.fetchWorkspaceSystemVault(auth);
  const vault = await VaultResource.fetchById(
    auth,
    context.query.vaultId as string
  );
  if (!vault || !systemVault || !vault.canList(auth)) {
    return {
      notFound: true,
    };
  }

  const isBuilder = auth.isBuilder();
  const canWriteInVault = vault.canWrite(auth);

  const integrations: DataSourceIntegration[] = [];

  if (vault.kind === "system") {
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

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      isAdmin,
      isBuilder,
      canWriteInVault,
      owner,
      plan,
      subscription,
      vault: vault.toJSON(),
      systemVault: systemVault.toJSON(),
      integrations,
    },
  };
});

export default function Vault({
  category,
  isAdmin,
  canWriteInVault,
  owner,
  plan,
  vault,
  systemVault,
  integrations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <Page.Vertical gap="xl" align="stretch">
      {vault.kind === "system" && (
        <Page.Header
          title="Connection Admin"
          description="Manage the applications and data Dust has access to."
          icon={CloudArrowLeftRightIcon}
        />
      )}
      {category === "apps" ? (
        <VaultAppsList
          owner={owner}
          vault={vault}
          canWriteInVault={canWriteInVault}
          onSelect={(sId) => {
            void router.push(`/w/${owner.sId}/vaults/${vault.sId}/apps/${sId}`);
          }}
        />
      ) : (
        <VaultResourcesList
          owner={owner}
          plan={plan}
          vault={vault}
          systemVault={systemVault}
          isAdmin={isAdmin}
          canWriteInVault={canWriteInVault}
          category={category}
          integrations={integrations}
          onSelect={(sId) => {
            void router.push(
              `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}/data_source_views/${sId}`
            );
          }}
        />
      )}
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
