import type {
  DataSourceViewCategory,
  UserType,
  VaultType,
} from "@dust-tt/types";
import { isDataSourceViewCategory } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    category: DataSourceViewCategory;
    user: UserType;
    vault: VaultType;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();
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

  const dataSourceViewCategory = context.query.category;
  if (
    typeof dataSourceViewCategory !== "string" ||
    !isDataSourceViewCategory(dataSourceViewCategory)
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      category: dataSourceViewCategory,
      gaTrackingId: config.getGaTrackingId(),
      owner,
      subscription,
      user,
      vault: vault.toJSON(),
    },
  };
});

export default function Vault({
  category,
  vault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      Manage {category} connections in vault {vault.name}
    </>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
