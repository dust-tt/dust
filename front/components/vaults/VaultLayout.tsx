import { FolderIcon, LockIcon, PlanetIcon } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceViewCategory,
  DataSourceViewType,
  SubscriptionType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import React, { useState } from "react";

import RootLayout from "@app/components/app/RootLayout";
import AppLayout from "@app/components/sparkle/AppLayout";
import { BreadCrumb } from "@app/components/vaults/Breadcrumb";
import { CreateVaultModal } from "@app/components/vaults/CreateVaultModal";
import { CATEGORY_DETAILS } from "@app/components/vaults/VaultCategoriesList";
import VaultSideBarMenu from "@app/components/vaults/VaultSideBarMenu";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useDataSourceContentNodes } from "@app/lib/swr";

export interface VaultLayoutProps {
  gaTrackingId: string;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  vault: VaultType;
  category?: DataSourceViewCategory;
  dataSource?: DataSourceType;
  dataSourceView?: DataSourceViewType;
  parentId?: string | null;
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
    subscription,
    vault,
    category,
    dataSource,
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
            setShowVaultCreationModal={setShowVaultCreationModal}
          />
        }
      >
        <VaultBreadCrumbs
          vault={vault}
          category={category}
          owner={owner}
          dataSource={dataSource}
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
  dataSource,
  dataSourceView,
  parentId,
}: {
  owner: WorkspaceType;
  vault: VaultType;
  category?: DataSourceViewCategory;
  dataSource?: DataSourceType;
  dataSourceView?: DataSourceViewType;
  parentId?: string;
}) {
  const { nodes } = useDataSourceContentNodes({
    owner,
    dataSource: dataSource,
    internalIds: parentId ? [parentId] : [],
  });

  const { title: folderName, parentInternalId } = nodes[0] || {};

  if (!category) {
    return null;
  }

  const items: { label: string; [key: string]: any }[] = [
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
      href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}`,
    },
  ];

  if (dataSourceView) {
    items.push({
      icon: dataSourceView.connectorProvider ? (
        React.createElement(
          CONNECTOR_CONFIGURATIONS[dataSourceView.connectorProvider]
            .logoComponent
        )
      ) : (
        <FolderIcon className="text-brand" />
      ),
      label: dataSourceView.connectorProvider
        ? CONNECTOR_CONFIGURATIONS[dataSourceView.connectorProvider].name
        : dataSourceView.name,
      href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${dataSourceView.sId}`,
    });

    if (folderName) {
      if (parentInternalId) {
        items.push({
          label: "...",
          href: `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${parentInternalId}`,
        });
      }
      items.push({
        label: folderName,
        icon: <FolderIcon className="text-brand" />,
      });
    }
  }

  return (
    <div className="pb-8">
      <BreadCrumb items={items} />
    </div>
  );
}
