import {
  LockIcon,
  Page,
  PuzzleIcon,
  Tab,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type {
  PlanType,
  SubscriptionType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import { subNavigationBuild } from "@app/components/navigation/config";
import { CompanyIcon } from "@app/components/navigation/DataSourceNavigationTree";
import AppLayout from "@app/components/sparkle/AppLayout";
import { VaultCategoriesList } from "@app/components/vaults/VaultCategoriesList";
import { VaultMembers } from "@app/components/vaults/VaultMembers";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  plan: PlanType;
  vault: VaultType;
  gaTrackingId: string;
  dustClientFacingUrl: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  const vaultId = context.params?.vId as string;

  const vault = await VaultResource.fetchById(auth, vaultId);

  if (!owner || !plan || !subscription || !vault) {
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
      vault: vault.toJSON(),
      gaTrackingId: GA_TRACKING_ID,
      dustClientFacingUrl: config.getClientFacingUrl(),
    },
  };
});

export default function VaultView({
  owner,
  subscription,
  isAdmin,
  vault,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [currentTab, setCurrentTab] = useState("resources");
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
        <Page.Header
          title={vault.name}
          icon={vault.kind === "global" ? CompanyIcon : LockIcon}
          description="Manage connections to your products and the real-time data feeds Dust has access to."
        />

        {vault.kind !== "global" && (
          <div className="s-w-[320px]">
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
            isAdmin={isAdmin}
            onSelect={(category) => {
              void router.push(
                `/w/${owner.sId}/vaults/${vault.sId}/resources/${category}`
              );
            }}
          />
        )}
        {currentTab === "members" && (
          <VaultMembers owner={owner} vault={vault} isAdmin={isAdmin} />
        )}
      </Page.Vertical>
    </AppLayout>
  );
}
