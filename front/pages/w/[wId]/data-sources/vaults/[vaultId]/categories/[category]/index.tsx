import { Page } from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  PlanType,
  VaultType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { VaultAppsList } from "@app/components/vaults/VaultAppsList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import { VaultResourcesList } from "@app/components/vaults/VaultResourcesList";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceViewCategory;
    isAdmin: boolean;
    vault: VaultType;
    systemVault: VaultType;
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

  const systemVault = await VaultResource.fetchWorkspaceSystemVault(auth);
  const vault = await VaultResource.fetchById(
    auth,
    context.query.vaultId as string
  );
  if (!vault || !systemVault) {
    return {
      notFound: true,
    };
  }
  const isAdmin = auth.isAdmin();

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      gaTrackingId: config.getGaTrackingId(),
      isAdmin,
      owner,
      plan,
      subscription,
      vault: vault.toJSON(),
      systemVault: systemVault.toJSON(),
    },
  };
});

export default function Vault({
  category,
  isAdmin,
  owner,
  plan,
  vault,
  systemVault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <Page.Vertical gap="xl" align="stretch">
      {category === "apps" ? (
        <VaultAppsList
          owner={owner}
          onSelect={(sId) => {
            void router.push(`/w/${owner.sId}/a/${sId}`);
          }}
        />
      ) : (
        <VaultResourcesList
          owner={owner}
          plan={plan}
          vault={vault}
          systemVault={systemVault}
          isAdmin={isAdmin}
          category={category}
          onSelect={(sId) => {
            void router.push(
              `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${sId}`
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
