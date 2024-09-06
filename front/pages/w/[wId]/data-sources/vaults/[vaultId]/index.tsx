import {
  LockIcon,
  Page,
  PlanetIcon,
  PuzzleIcon,
  Tab,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { VaultType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useState } from "react";

import { VaultCategoriesList } from "@app/components/vaults/VaultCategoriesList";
import type { VaultLayoutProps } from "@app/components/vaults/VaultLayout";
import { VaultLayout } from "@app/components/vaults/VaultLayout";
import { VaultMembers } from "@app/components/vaults/VaultMembers";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<
  VaultLayoutProps & {
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
      gaTrackingId: config.getGaTrackingId(),
      isAdmin,
      owner,
      subscription,
      vault: vault.toJSON(),
    },
  };
});

export default function Vault({
  isAdmin,
  owner,
  vault,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState("resources");
  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title={vault.kind === "global" ? "Company Data" : vault.name}
        icon={vault.kind === "global" ? PlanetIcon : LockIcon}
        description="Manage connections to your products and the real-time data feeds Dust has access to."
      />

      {vault.kind !== "global" && isAdmin && (
        <div className="w-[320px]">
          <Tab
            tabs={[
              {
                label: "Resources",
                id: "resources",
                current: currentTab === "resources",
                icon: PuzzleIcon,
                sizing: "expand",
              },
              {
                label: "Members",
                id: "members",
                current: currentTab === "members",
                icon: UserGroupIcon,
                sizing: "expand",
              },
            ]}
            setCurrentTab={(tabId) => {
              setCurrentTab(tabId);
            }}
          />
        </div>
      )}
      {currentTab === "resources" && (
        <VaultCategoriesList
          owner={owner}
          vault={vault}
          onSelect={(category) => {
            void router.push(
              `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}`
            );
          }}
        />
      )}
      {currentTab === "members" && isAdmin && (
        <VaultMembers owner={owner} vault={vault} isAdmin={isAdmin} />
      )}
    </Page.Vertical>
  );
}

Vault.getLayout = (page: ReactElement, pageProps: any) => {
  return <VaultLayout pageProps={pageProps}>{page}</VaultLayout>;
};
