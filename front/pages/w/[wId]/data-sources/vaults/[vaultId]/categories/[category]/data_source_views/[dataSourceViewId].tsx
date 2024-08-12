import type { DataSourceViewType, UserType, VaultType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
    dataSourceView: DataSourceViewType;
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

  const { dataSourceViewId } = context.query;
  if (typeof dataSourceViewId !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    dataSourceViewId
  );
  if (!dataSourceView) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      dataSourceView: dataSourceView.toJSON(),
      gaTrackingId: config.getGaTrackingId(),
      owner,
      subscription,
      user,
      vault: vault.toJSON(),
    },
  };
});

export default function Vault({
  dataSourceView,
  vault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      Data source view {dataSourceView.sId} in vault {vault.name}
    </>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
