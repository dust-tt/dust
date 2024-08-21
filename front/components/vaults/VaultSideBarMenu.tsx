import {
  Button,
  CloudArrowLeftRightIcon,
  CommandLineIcon,
  FolderIcon,
  GlobeAltIcon,
  Item,
  LockIcon,
  PlanetIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  VaultKind,
  VaultType,
} from "@dust-tt/types";
import { assertNever, DATA_SOURCE_VIEW_CATEGORIES } from "@dust-tt/types";
import { groupBy } from "lodash";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { Fragment, useEffect, useState } from "react";

import {
  CONNECTOR_CONFIGURATIONS,
  getDataSourceNameFromView,
} from "@app/lib/connector_providers";
import { useVaultDataSourceViews, useVaultInfo, useVaults } from "@app/lib/swr";

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
  }));

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

const RootItemIconWrapper = (
  IconComponent: React.ComponentType<React.SVGProps<SVGSVGElement>>
) => {
  return <IconComponent className="text-brand" />;
};

const SubItemIconItemWrapper = (
  IconComponent: React.ComponentType<React.SVGProps<SVGSVGElement>>
) => {
  return <IconComponent className="text-element-700" />;
};

// System vault.

const SYSTEM_VAULTS_ITEMS = [
  {
    label: "Connection Management",
    visual: RootItemIconWrapper(CloudArrowLeftRightIcon),
    category: "managed",
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
    <>
      {SYSTEM_VAULTS_ITEMS.map((item) => (
        <SystemVaultItem
          category={item.category}
          key={item.label}
          label={item.label}
          owner={owner}
          vault={vault}
          visual={item.visual}
        />
      ))}
    </>
  );
};

const SystemVaultItem = ({
  category,
  label,
  owner,
  vault,
  visual,
}: {
  category: string;
  label: string;
  owner: LightWorkspaceType;
  vault: VaultType;
  visual: ReactElement;
}) => {
  const router = useRouter();

  const itemPath = `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${category}/data_source_views`;
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
      label={label}
      collapsed={!isExpanded}
      onItemClick={() => router.push(itemPath)}
      isSelected={router.asPath === itemPath}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      visual={visual}
      size="md"
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
      label={vault.kind === "global" ? "Company Data" : vault.name}
      collapsed={!isExpanded}
      onItemClick={() => router.push(vaultPath)}
      isSelected={router.asPath === vaultPath}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      visual={
        vault.kind === "global"
          ? RootItemIconWrapper(PlanetIcon)
          : RootItemIconWrapper(LockIcon)
      }
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
    label: string;
    icon: ReactElement<{
      className?: string;
    }>;
  };
} = {
  managed: {
    label: "Connected Data",
    icon: SubItemIconItemWrapper(CloudArrowLeftRightIcon),
  },
  files: {
    label: "Files",
    icon: SubItemIconItemWrapper(FolderIcon),
  },
  webfolder: {
    label: "Websites",
    icon: SubItemIconItemWrapper(GlobeAltIcon),
  },
  apps: {
    label: "Apps",
    icon: SubItemIconItemWrapper(CommandLineIcon),
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
  const configuration = item.connectorProvider
    ? CONNECTOR_CONFIGURATIONS[item.connectorProvider]
    : null;

  const LogoComponent = configuration?.logoComponent ?? FolderIcon;
  const dataSourceViewPath = `/w/${owner.sId}/data-sources/vaults/${vault.sId}/categories/${item.category}/data_source_views/${item.sId}`;

  return (
    <Tree.Item
      type="leaf"
      isSelected={
        router.asPath === dataSourceViewPath ||
        router.asPath.includes(dataSourceViewPath + "/") ||
        router.asPath.includes(dataSourceViewPath + "?")
      }
      onItemClick={() => router.push(dataSourceViewPath)}
      label={getDataSourceNameFromView(item)}
      visual={SubItemIconItemWrapper(LogoComponent)}
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
  category: string;
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
