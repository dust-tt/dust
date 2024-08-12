import { LockIcon, Page } from "@dust-tt/sparkle";
import type {
  DataSourceOrViewCategory,
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
import { VaultResourcesList } from "@app/components/vaults/VaultResourcesList";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  plan: PlanType;
  vault: VaultType;
  category: DataSourceOrViewCategory;
  gaTrackingId: string;
  dustClientFacingUrl: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  const vaultId = context.params?.vId as string;
  const category = context.params?.category;
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
      category,
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
  category,
  vault,
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
              icon:
                vault.kind === "global" ? (
                  <CompanyIcon className="text-emerald-500" />
                ) : (
                  <LockIcon className="text-emerald-500" />
                ),
              label: vault.name,
              href: `/w/${owner.sId}/vaults/${vault.sId}`,
            },
            {
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
              `/w/${owner.sId}/vaults/${vault.sId}/${CATEGORY_DETAILS[category].dataSourceOrView}/${sId}`
            );
          }}
        />
      </Page.Vertical>
    </AppLayout>
  );
}
