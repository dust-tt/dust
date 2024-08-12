import { LockIcon, Page } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  PlanType,
  SubscriptionType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import { subNavigationBuild } from "@app/components/navigation/config";
import { CompanyIcon } from "@app/components/navigation/DataSourceNavigationTree";
import AppLayout from "@app/components/sparkle/AppLayout";
import { BreadCrumb } from "@app/components/vaults/Breadcrumb";
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import { VaultDataSourceContentList } from "@app/components/vaults/VaultDataSourceContentList";
import config from "@app/lib/api/config";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  plan: PlanType;
  vault: VaultType;
  parentId: string | null;
  dataSource: DataSourceType;
  gaTrackingId: string;
  dustClientFacingUrl: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  const vaultId = context.params?.vId as string;
  const dataSourceId = context.params?.dsId;
  const parentId = context.query?.parentId as string;
  const vault = await VaultResource.fetchById(auth, vaultId);

  if (!owner || !plan || !subscription || !vault) {
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

  const isAdmin = auth.isAdmin();
  const GA_TRACKING_ID = config.getGaTrackingId();

  return {
    props: {
      owner,
      subscription,
      isAdmin,
      plan,
      dataSource: dataSource.toJSON(),
      vault: vault.toJSON(),
      parentId: parentId || null,
      gaTrackingId: GA_TRACKING_ID,
      dustClientFacingUrl: config.getClientFacingUrl(),
    },
  };
});

export default function VaultView({
  owner,
  subscription,
  isAdmin,
  plan,
  dataSource,
  vault,
  parentId,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "vaults",
      })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <BreadCrumb
          items={[
            {
              icon: vault.kind === "global" ? <CompanyIcon /> : <LockIcon />,
              label: vault.name,
              href: `/w/${owner.sId}/vaults/${vault.sId}`,
            },
            {
              label: CATEGORY_DETAILS.managed.label,
              href: `/w/${owner.sId}/vaults/${vault.sId}/resources/managed`,
            },
            {
              label: dataSource.connectorProvider
                ? CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].name
                : dataSource.name,
              href: `/w/${owner.sId}/vaults/${vault.sId}/data_source/${dataSource.id}`,
            },
          ]}
        />
        <VaultDataSourceContentList
          owner={owner}
          vault={vault}
          isAdmin={isAdmin}
          parentId={parentId}
          dataSourceId={dataSource.name}
          onSelect={(parentId) => {
            void router.push(
              `/w/${owner.sId}/vaults/${vault.sId}/data_source/${dataSource.id}?parentId=${parentId}`
            );
          }}
        />
      </Page.Vertical>
    </AppLayout>
  );
}
