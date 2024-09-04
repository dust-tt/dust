import {
  Breadcrumbs,
  CompanyIcon,
  FolderIcon,
  LockIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  DataSourceViewType,
  SubscriptionType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { ComponentType } from "react";
import React, { useMemo, useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import AppLayout from "@app/components/sparkle/AppLayout";
import { CreateVaultModal } from "@app/components/vaults/CreateVaultModal";
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import VaultSideBarMenu from "@app/components/vaults/VaultSideBarMenu";
import {
  getConnectorProviderLogoWithFallback,
  getDataSourceNameFromView,
} from "@app/lib/connector_providers";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";

export interface VaultLayoutProps {
  gaTrackingId: string;
  owner: WorkspaceType;
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
  const [showVaultCreationModal, setShowVaultCreationModal] = useState(false);
  const {
    gaTrackingId,
    owner,
    isAdmin,
    subscription,
    vault,
    category,
    dataSourceView,
    parentId,
  } = pageProps;

  return (
    <RootLayout>
      <AppLayout
        subscription={subscription}
        owner={owner}
        gaTrackingId={gaTrackingId}
        navChildren={
          <VaultSideBarMenu
            owner={owner}
            isAdmin={isAdmin}
            setShowVaultCreationModal={setShowVaultCreationModal}
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
        <CreateVaultModal
          owner={owner}
          isOpen={showVaultCreationModal}
          onClose={() => setShowVaultCreationModal(false)}
        />
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
    dataSourceView,
    internalIds: parentId ? [parentId] : [],
  });

  const { nodes: folders } = useDataSourceViewContentNodes({
    owner,
    dataSourceView,
    internalIds: currentFolder?.parentInternalIds || [],
  });

  const items: {
    label: string;
    icon?: ComponentType;
    href?: string;
  }[] = useMemo(() => {
    if (!category) {
      return [];
    }

    const items = [
      {
        icon: vault.kind === "global" ? CompanyIcon : LockIcon,
        label: vault.kind === "global" ? "Company Data" : vault.name,
        href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}`,
      },
      {
        icon: CATEGORY_DETAILS[category].icon,
        label: CATEGORY_DETAILS[category].label,
        href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}`,
      },
    ];

    if (dataSourceView) {
      if (category === "managed") {
        // Remove the "Connected data" from breadcrumbs to avoid hiding the actual
        // managed connection name

        // Showing the actual managed connection name (e.g. microsoft, slack...) is
        // more important and implies clearly that we are dealing with connected
        // data
        items.pop();
      }

      items.push({
        icon: getConnectorProviderLogoWithFallback(
          dataSourceView.dataSource.connectorProvider,
          FolderIcon
        ),
        label: getDataSourceNameFromView(dataSourceView),
        href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${dataSourceView.sId}`,
      });

      for (const node of [...folders].reverse()) {
        items.push({
          label: node.title,
          href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${node.internalId}`,
          icon: FolderIcon,
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
