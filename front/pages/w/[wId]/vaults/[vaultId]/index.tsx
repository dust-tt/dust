import { Chip, InformationCircleIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { CreateOrEditVaultModal } from "@app/components/vaults/CreateOrEditVaultModal";
import { VaultCategoriesList } from "@app/components/vaults/VaultCategoriesList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { useVaultInfo } from "@app/lib/swr/vaults";
import { getVaultIcon, getVaultName } from "@app/lib/vaults";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & { userId: string }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const isAdmin = auth.isAdmin();
  const plan = auth.getNonNullablePlan();

  if (!subscription) {
    return {
      notFound: true,
    };
  }

  const vault = await VaultResource.fetchById(
    auth,
    context.query.vaultId as string
  );
  if (!vault || !vault.canList(auth)) {
    return {
      notFound: true,
    };
  }

  // No root page for System vaults since it contains only managed data sources.
  if (vault.isSystem()) {
    return {
      redirect: {
        destination: `/w/${owner.sId}/vaults/${vault.sId}/categories/managed`,
        permanent: false,
      },
    };
  }

  return {
    props: {
      isAdmin,
      owner,
      plan,
      subscription,
      vault: vault.toJSON(),
      userId: auth.getNonNullableUser().sId,
    },
  };
});

export default function Vault({
  isAdmin,
  owner,
  userId,
  vault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { vaultInfo } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
  });

  const router = useRouter();
  const [showVaultEditionModal, setShowVaultEditionModal] = useState(false);
  const isMember = useMemo(
    () => vaultInfo?.members?.some((m) => m.sId === userId),
    [userId, vaultInfo?.members]
  );

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header title={getVaultName(vault)} icon={getVaultIcon(vault)} />
      {vaultInfo && !isMember && (
        <div>
          <Chip
            color="pink"
            label="You are not a member of this vault."
            size="sm"
            icon={InformationCircleIcon}
          />
        </div>
      )}
      <VaultCategoriesList
        owner={owner}
        vault={vault}
        onSelect={(category) => {
          void router.push(
            `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}`
          );
        }}
        onButtonClick={() => setShowVaultEditionModal(true)}
        isAdmin={isAdmin}
      />
      <CreateOrEditVaultModal
        owner={owner}
        isOpen={showVaultEditionModal}
        onClose={() => setShowVaultEditionModal(false)}
        vault={vault}
        isAdmin={isAdmin}
      />
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
