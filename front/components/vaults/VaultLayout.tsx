import { Breadcrumbs, Dialog } from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  DataSourceViewType,
  PlanType,
  SubscriptionType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import React, { useCallback, useMemo, useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import AppLayout from "@app/components/sparkle/AppLayout";
import { CreateOrEditVaultModal } from "@app/components/vaults/CreateOrEditVaultModal";
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import VaultSideBarMenu from "@app/components/vaults/VaultSideBarMenu";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { isEntreprisePlan } from "@app/lib/plans/plan_codes";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useVaultsAsAdmin } from "@app/lib/swr/vaults";
import { getVaultIcon, isPrivateVaultsLimitReached } from "@app/lib/vaults";

export interface VaultLayoutProps {
  owner: WorkspaceType;
  plan: PlanType;
  isAdmin: boolean;
  subscription: SubscriptionType;
  vault: VaultType;
  category?: DataSourceViewCategory;
  dataSourceView?: DataSourceViewType;
  parentId?: string;
}

export function VaultLayout({
  children,
  pageProps,
}: {
  children: React.ReactNode;
  pageProps: VaultLayoutProps;
}) {
  const [vaultCreationModalState, setVaultCreationModalState] = useState({
    isOpen: false,
    defaultRestricted: false,
  });

  const {
    owner,
    plan,
    isAdmin,
    subscription,
    vault,
    category,
    dataSourceView,
    parentId,
  } = pageProps;
  const router = useRouter();

  const { vaults } = useVaultsAsAdmin({
    workspaceId: owner.sId,
    disabled: plan.limits.vaults.maxVaults === 0 || !isAdmin,
  });

  const isLimitReached = isPrivateVaultsLimitReached(vaults, plan);
  const isEnterprise = isEntreprisePlan(plan.code);

  const closeVaultCreationModal = useCallback(() => {
    setVaultCreationModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openVaultCreationModal = useCallback(
    ({ defaultRestricted }: { defaultRestricted: boolean }) => {
      setVaultCreationModalState({ defaultRestricted, isOpen: true });
    },
    []
  );

  return (
    <RootLayout>
      <AppLayout
        subscription={subscription}
        owner={owner}
        navChildren={
          <VaultSideBarMenu
            owner={owner}
            isAdmin={isAdmin}
            openVaultCreationModal={openVaultCreationModal}
          />
        }
      >
        <VaultBreadCrumbs
          vault={vault}
          category={category}
          owner={owner}
          dataSourceView={dataSourceView}
          parentId={parentId ?? undefined}
        />
        {children}
        {isAdmin && !isLimitReached && (
          <CreateOrEditVaultModal
            isAdmin={isAdmin}
            owner={owner}
            isOpen={!isLimitReached && vaultCreationModalState.isOpen}
            onClose={closeVaultCreationModal}
            onCreated={(vault) => {
              void router.push(`/w/${owner.sId}/vaults/${vault.sId}`);
            }}
            defaultRestricted={vaultCreationModalState.defaultRestricted}
          />
        )}
        {isAdmin && isLimitReached && (
          <Dialog
            alertDialog
            isOpen={isLimitReached && vaultCreationModalState.isOpen}
            title="You can't create more spaces."
            onValidate={closeVaultCreationModal}
          >
            <div>
              {isEnterprise
                ? "We're going to make changes to data permissions spaces soon and are limiting the creation of spaces for that reason. Reach out to us to learn more."
                : "The maximum number of spaces for this workspace has been reached. Please reach out at support@dust.tt to learn more."}
            </div>
          </Dialog>
        )}
      </AppLayout>
    </RootLayout>
  );
}

function VaultBreadCrumbs({
  owner,
  vault,
  category,
  dataSourceView,
  parentId,
}: {
  owner: WorkspaceType;
  vault: VaultType;
  category?: DataSourceViewCategory;
  dataSourceView?: DataSourceViewType;
  parentId?: string;
}) {
  const {
    nodes: [currentFolder],
  } = useDataSourceViewContentNodes({
    owner,
    dataSourceView: parentId ? dataSourceView : undefined,
    internalIds: parentId ? [parentId] : [],
    viewType: "documents",
  });

  const { nodes: folders } = useDataSourceViewContentNodes({
    dataSourceView: currentFolder ? dataSourceView : undefined,
    internalIds: currentFolder?.parentInternalIds ?? [],
    owner,
    viewType: "documents",
  });

  const items = useMemo(() => {
    if (!category) {
      return [];
    }

    const items: {
      label: string;
      icon?: ComponentType;
      href?: string;
    }[] = [
      {
        icon: getVaultIcon(vault),
        label: vault.kind === "global" ? "Company Data" : vault.name,
        href: `/w/${owner.sId}/vaults/${vault.sId}`,
      },
      {
        label: CATEGORY_DETAILS[category].label,
        href: `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}`,
      },
    ];

    if (vault.kind === "system") {
      if (!dataSourceView) {
        return [];
      }

      // For system vault, we don't want the first breadcrumb to show, since
      // it's only used to manage "connected data" already. Otherwise it would
      // expose a useless link, and name would be redundant with the "Connected
      // data" label
      items.shift();
    }

    if (dataSourceView) {
      if (category === "managed" && vault.kind !== "system") {
        // Remove the "Connected data" from breadcrumbs to avoid hiding the actual
        // managed connection name

        // Showing the actual managed connection name (e.g. microsoft, slack...) is
        // more important and implies clearly that we are dealing with connected
        // data
        items.pop();
      }

      items.push({
        label: getDataSourceNameFromView(dataSourceView),
        href: `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}/data_source_views/${dataSourceView.sId}`,
      });

      for (const node of [...folders].reverse()) {
        items.push({
          label: node.title,
          href: `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${node.internalId}`,
        });
      }
    }
    return items;
  }, [owner, vault, category, dataSourceView, folders]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pb-8">
      <Breadcrumbs items={items} />
    </div>
  );
}
