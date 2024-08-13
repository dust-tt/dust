import { LockIcon, Page, PlanetIcon } from "@dust-tt/sparkle";
import type { DataSourceOrViewCategory, VaultType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { BreadCrumb } from "@app/components/vaults/Breadcrumb";
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import { VaultResourcesList } from "@app/components/vaults/VaultResourcesList";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceOrViewCategory;
    isAdmin: boolean;
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
  const isAdmin = auth.isAdmin();

  return {
    props: {
      category: context.query.category as DataSourceOrViewCategory,
      gaTrackingId: config.getGaTrackingId(),
      isAdmin,
      owner,
      subscription,
      vault: vault.toJSON(),
    },
  };
});

export default function Vault({
  category,
  isAdmin,
  owner,
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
            label: CATEGORY_DETAILS[category].label,
          },
        ]}
      />

      <VaultResourcesList
        owner={owner}
        vault={vault}
        isAdmin={isAdmin}
        category={category}
        onSelect={(sId) => {
          void router.push(
            `/w/${owner.sId}/data-sources/vaults/${vault.sId}/category/${category}/${CATEGORY_DETAILS[category].dataSourceOrView}/${sId}`
          );
        }}
      />
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
