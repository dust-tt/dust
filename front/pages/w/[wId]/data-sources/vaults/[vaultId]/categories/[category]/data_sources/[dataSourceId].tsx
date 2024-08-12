import type { DataSourceType, UserType, VaultType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    dataSource: DataSourceType;
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

  return {
    props: {
      dataSource: dataSource.toJSON(),
      gaTrackingId: config.getGaTrackingId(),
      owner,
      subscription,
      user,
      vault: vault.toJSON(),
    },
  };
});

export default function Vault({
  dataSource,
  vault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      Data source {dataSource.name} in vault {vault.name}
    </>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
