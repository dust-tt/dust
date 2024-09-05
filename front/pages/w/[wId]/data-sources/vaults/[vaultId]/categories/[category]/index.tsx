import { Page } from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  PlanType,
  UserType,
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
    dustClientFacingUrl: string;
    isAdmin: boolean;
    isBuilder: boolean;
    vault: VaultType;
    systemVault: VaultType;
    plan: PlanType;
    user: UserType;
    readOnly: boolean;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const plan = auth.getNonNullablePlan();
  const user = auth.getNonNullableUser();
  const readOnly = !auth.isBuilder();

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
  if (!vault || !systemVault) {
    return {
      notFound: true,
    };
  }
  const isAdmin = auth.isAdmin();
  const isBuilder = auth.isBuilder();

  return {
    props: {
      category: context.query.category as DataSourceViewCategory,
      dustClientFacingUrl: config.getClientFacingUrl(),
      gaTrackingId: config.getGaTrackingId(),
      isAdmin,
      isBuilder,
      owner,
      plan,
      subscription,
      vault: vault.toJSON(),
      systemVault: systemVault.toJSON(),
      user,
      readOnly,
    },
  };
});

export default function Vault({
  category,
  dustClientFacingUrl,
  isAdmin,
  isBuilder,
  owner,
  user,
  plan,
  vault,
  systemVault,
  readOnly,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <Page.Vertical gap="xl" align="stretch">
      {category === "apps" ? (
        <VaultAppsList
          owner={owner}
          isBuilder={isBuilder}
          onSelect={(sId) => {
            void router.push(`/w/${owner.sId}/a/${sId}`);
          }}
        />
      ) : (
        <VaultResourcesList
          dustClientFacingUrl={dustClientFacingUrl}
          owner={owner}
          user={user}
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
          readOnly={readOnly}
        />
      )}
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
