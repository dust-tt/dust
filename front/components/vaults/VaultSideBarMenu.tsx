import {
  Button,
  CloudArrowLeftRightIcon,
  CommandLineIcon,
  CompanyIcon,
  FolderIcon,
  GlobeAltIcon,
  Item,
  LockIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  DataSourceViewType,
  LightWorkspaceType,
  VaultKind,
  VaultType,
} from "@dust-tt/types";
import { assertNever, DATA_SOURCE_VIEW_CATEGORIES } from "@dust-tt/types";
import { groupBy } from "lodash";
import { useRouter } from "next/router";
import type { ComponentType, ReactElement } from "react";
import { Fragment, useEffect, useState } from "react";

import {
  getConnectorProviderLogoWithFallback,
  getDataSourceNameFromView,
} from "@app/lib/connector_providers";
import {
  useVaultDataSourceViews,
  useVaultInfo,
  useVaults,
} from "@app/lib/swr/vaults";

interface VaultSideBarMenuProps {
  owner: LightWorkspaceType;
  setShowVaultCreationModal: (show: boolean) => void;
}

const VAULTS_SORT_ORDER: VaultKind[] = ["system", "global", "regular"];

export default function VaultSideBarMenu({
  owner,
  setShowVaultCreationModal,
}: VaultSideBarMenuProps) {
  const { vaults, isVaultsLoading } = useVaults({ workspaceId: owner.sId });

  if (!vaults || isVaultsLoading) {
    return <></>;
  }

  // Group by kind and sort.
  const groupedVaults = groupBy(vaults, (vault) => vault.kind);
  const sortedGroupedVaults = VAULTS_SORT_ORDER.map((kind) => ({
    kind,
    vaults: groupedVaults[kind] || [],
    // remove the empty system menu for users & builders
  })).filter(({ vaults, kind }) => !(kind === "system" && vaults.length === 0));

  return (
    <div className="flex h-0 min-h-full w-full overflow-y-auto">
      <div className="flex w-full flex-col px-2">
        <Item.List>
          {sortedGroupedVaults.map(({ kind, vaults }, index) => {
            const sectionLabel = getSectionLabel(kind);

            return (
              <Fragment key={`vault-section-${index}`}>
                <div className="flex items-center justify-between">
                  <Item.SectionHeader label={sectionLabel} />
                  {sectionLabel === "PRIVATE" && (
                    <Button
                      className="mt-4"
                      size="xs"
                      variant="tertiary"
                      label="Create Vault "
                      icon={LockIcon}
                      onClick={() => setShowVaultCreationModal(true)}
                    />
                  )}
                </div>
                {renderVaultItems(vaults, owner)}
              </Fragment>
            );
          })}
        </Item.List>
      </div>
    </div>
  );
}

// Function to render vault items.
const renderVaultItems = (vaults: VaultType[], owner: LightWorkspaceType) =>
  vaults.map((vault) => (
    <Fragment key={`vault-${vault.sId}`}>
      {vault.kind === "system" ? (
        <SystemVaultMenu owner={owner} vault={vault} />
      ) : (
        <VaultMenuItem owner={owner} vault={vault} />
      )}
    </Fragment>
  ));

const getSectionLabel = (kind: VaultKind) => {
  switch (kind) {
    case "global":
      return "SHARED";

    case "regular":
      return "PRIVATE";

    case "system":
      return "SYSTEM";

    default:
      assertNever(kind);
  }
};

// System vault.

const SYSTEM_VAULTS_ITEMS = [
  {
    label: "Connection Management",
    visual: CloudArrowLeftRightIcon,
    tailwindIconTextColor: "text-brand",
    category: "managed" as DataSourceViewCategory,
  },
  // TODO(GROUPS_UI) Add support for Dust apps.
];

const SystemVaultMenu = ({
  owner,
  vault,
}: {
  owner: LightWorkspaceType;
  vault: VaultType;
}) => {
  return (
    <Tree variant="navigator">
      {SYSTEM_VAULTS_ITEMS.map((item) => (
        <SystemVaultItem
          category={item.category}
          key={item.label}
          label={item.label}
          owner={owner}
          vault={vault}
          visual={item.visual}
          tailwindIconTextColor={item.tailwindIconTextColor}
        />
      ))}
    </Tree>
  );
};

type IconType = ComponentType<{ className?: string }>;

const SystemVaultItem = ({
  category,
  label,
  owner,
  vault,
  visual,
  tailwindIconTextColor,
}: {
  category: DataSourceViewCategory;
  label: string;
  owner: LightWorkspaceType;
  vault: VaultType;
  visual: IconType;
  tailwindIconTextColor: string;
}) => {
  const router = useRouter();

  const itemPath = `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}`;
  const isAncestorToCurrentPage = router.asPath.includes(itemPath);

  // Unfold the item if it's an ancestor of the current page.
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    setIsExpanded(isAncestorToCurrentPage);
  }, [isAncestorToCurrentPage]);

  const { isVaultDataSourceViewsLoading, vaultDataSourceViews } =
    useVaultDataSourceViews({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      category,
      disabled: !isExpanded,
    });

  return (
    <Tree.Item
      isNavigatable
      label={label}
      collapsed={!isExpanded}
      onItemClick={() => router.push(itemPath)}
      isSelected={router.asPath === itemPath}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      visual={visual}
      size="md"
      areActionsFading={false}
      tailwindIconTextColor={tailwindIconTextColor}
    >
      {isExpanded && (
        <Tree isLoading={isVaultDataSourceViewsLoading}>
          {vaultDataSourceViews.map((ds) => (
            <VaultDataSourceViewItem
              item={ds}
              key={ds.sId}
              owner={owner}
              vault={vault}
            />
          ))}
        </Tree>
      )}
    </Tree.Item>
  );
};

// Global + regular vaults.

const VaultMenuItem = ({
  owner,
  vault,
}: {
  owner: LightWorkspaceType;
  vault: VaultType;
}) => {
  const router = useRouter();

  const vaultPath = `/w/${owner.sId}/data-sources/vaults/${vault.sId}`;
  const isAncestorToCurrentPage = router.asPath.includes(vaultPath);

  // Unfold the vault if it's an ancestor of the current page.
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    setIsExpanded(isAncestorToCurrentPage);
  }, [isAncestorToCurrentPage]);

  const { vaultInfo, isVaultInfoLoading } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
    disabled: !isExpanded,
  });

  return (
    <Tree.Item
      isNavigatable
      label={vault.kind === "global" ? "Company Data" : vault.name}
      collapsed={!isExpanded}
      onItemClick={() => router.push(vaultPath)}
      isSelected={router.asPath === vaultPath}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      visual={vault.kind === "global" ? CompanyIcon : LockIcon}
      tailwindIconTextColor="text-brand"
      size="md"
      areActionsFading={false}
    >
      {isExpanded && (
        <Tree isLoading={isVaultInfoLoading}>
          {vaultInfo?.categories &&
            DATA_SOURCE_VIEW_CATEGORIES.map(
              (c) =>
                vaultInfo.categories[c] && (
                  <VaultCategoryItem
                    key={c}
                    category={c}
                    owner={owner}
                    vault={vault}
                  />
                )
            )}
        </Tree>
      )}
    </Tree.Item>
  );
};

const DATA_SOURCE_OR_VIEW_SUB_ITEMS: {
  [key: string]: {
    icon: ComponentType<{
      className?: string;
    }>;
    label: string;
  };
} = {
  managed: {
    icon: CloudArrowLeftRightIcon,
    label: "Connected Data",
  },
  folder: {
    icon: FolderIcon,
    label: "Folders",
  },
  website: {
    icon: GlobeAltIcon,
    label: "Websites",
  },
  apps: {
    icon: CommandLineIcon,
    label: "Apps",
  },
};

const VaultDataSourceViewItem = ({
  item,
  owner,
  vault,
}: {
  item: DataSourceViewType;
  owner: LightWorkspaceType;
  vault: VaultType;
}): ReactElement => {
  const router = useRouter();

  const LogoComponent = getConnectorProviderLogoWithFallback(
    item.dataSource.connectorProvider,
    FolderIcon
  );
  const dataSourceViewPath = `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${item.category}/data_source_views/${item.sId}`;

  return (
    <Tree.Item
      isNavigatable
      type="leaf"
      isSelected={
        router.asPath === dataSourceViewPath ||
        router.asPath.includes(dataSourceViewPath + "/") ||
        router.asPath.includes(dataSourceViewPath + "?")
      }
      onItemClick={() => router.push(dataSourceViewPath)}
      label={getDataSourceNameFromView(item)}
      visual={LogoComponent}
      areActionsFading={false}
    />
  );
};

const VaultCategoryItem = ({
  owner,
  vault,
  category,
}: {
  owner: LightWorkspaceType;
  vault: VaultType;
  category: DataSourceViewCategory;
}) => {
  const router = useRouter();

  const vaultCategoryPath = `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}`;
  const isAncestorToCurrentPage = router.asPath.includes(vaultCategoryPath);

  // Unfold the vault's category if it's an ancestor of the current page.
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    setIsExpanded(isAncestorToCurrentPage);
  }, [isAncestorToCurrentPage]);

  const categoryDetails = DATA_SOURCE_OR_VIEW_SUB_ITEMS[category];
  const { isVaultDataSourceViewsLoading, vaultDataSourceViews } =
    useVaultDataSourceViews({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      category,
      disabled: !isExpanded,
    });

  return (
    <Tree.Item
      isNavigatable
      label={categoryDetails.label}
      collapsed={!isExpanded}
      onItemClick={() => router.push(vaultCategoryPath)}
      isSelected={router.asPath === vaultCategoryPath}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      visual={categoryDetails.icon}
      areActionsFading={false}
    >
      {isExpanded && (
        <Tree isLoading={isVaultDataSourceViewsLoading}>
          {vaultDataSourceViews.map((ds) => (
            <VaultDataSourceViewItem
              item={ds}
              key={ds.sId}
              owner={owner}
              vault={vault}
            />
          ))}
        </Tree>
      )}
    </Tree.Item>
  );
};
