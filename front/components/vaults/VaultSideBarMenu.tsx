import {
  Button,
  CloudArrowLeftRightIcon,
  CommandLineIcon,
  FolderIcon,
  GlobeAltIcon,
  Item,
  PlusIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  AppType,
  DataSourceViewCategory,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  VaultKind,
  VaultType,
} from "@dust-tt/types";
import { assertNever, DATA_SOURCE_VIEW_CATEGORIES } from "@dust-tt/types";
import { sortBy, uniqBy } from "lodash";
import { useRouter } from "next/router";
import type { ComponentType, ReactElement } from "react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { useApps } from "@app/lib/swr/apps";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import {
  useVaultDataSourceViews,
  useVaultInfo,
  useVaults,
  useVaultsAsAdmin,
} from "@app/lib/swr/vaults";
import { getVaultIcon, getVaultName, groupVaults } from "@app/lib/vaults";

interface VaultSideBarMenuProps {
  isPrivateVaultsEnabled: boolean;
  owner: LightWorkspaceType;
  isAdmin: boolean;
  setShowVaultCreationModal?: (show: boolean) => void;
}

export default function VaultSideBarMenu({
  isPrivateVaultsEnabled,
  owner,
  isAdmin,
  setShowVaultCreationModal,
}: VaultSideBarMenuProps) {
  const { vaults: vaultsAsAdmin, isVaultsLoading: isVaultsAsAdminLoading } =
    useVaultsAsAdmin({
      workspaceId: owner.sId,
      disabled: !isAdmin,
    });

  const { vaults: vaultsAsUser, isVaultsLoading: isVaultsAsUserLoading } =
    useVaults({
      workspaceId: owner.sId,
    });

  // Vaults that are in the vaultsAsUser list should be displayed first, use the name as a tiebreaker.
  const compareVaults = useCallback(
    (v1: VaultType, v2: VaultType) => {
      const v1IsMember = !!vaultsAsUser.find((v) => v.sId === v1.sId);
      const v2IsMember = !!vaultsAsUser.find((v) => v.sId === v2.sId);

      if (v1IsMember && !v2IsMember) {
        return -1;
      } else if (!v1IsMember && v2IsMember) {
        return 1;
      } else {
        return v1.name.localeCompare(v2.name);
      }
    },
    [vaultsAsUser]
  );

  const vaults = useMemo(() => {
    return uniqBy(vaultsAsAdmin.concat(vaultsAsUser), "sId");
  }, [vaultsAsAdmin, vaultsAsUser]);

  if (isVaultsAsAdminLoading || isVaultsAsUserLoading || !vaultsAsUser) {
    return <></>;
  }

  // Group by kind and sort.
  const sortedGroupedVaults = groupVaults(vaults)
    // remove the empty system menu for users & builders
    .filter(({ vaults, kind }) => kind !== "system" || vaults.length !== 0);

  return (
    <div className="flex h-0 min-h-full w-full overflow-y-auto">
      <div className="flex w-full flex-col px-2">
        <Item.List>
          {sortedGroupedVaults.map(({ kind, vaults }, index) => {
            // Public vaults are created manually by us to hold public dust apps - other workspaces can't create them, so we do not show the section at all if there are no vaults.
            if (kind === "public" && !vaults.length) {
              return null;
            }
            if (kind === "regular") {
              if (!isPrivateVaultsEnabled) {
                return null;
              } else if (!vaults.length && !isAdmin) {
                return null;
              }
            }

            const sectionLabel = getSectionLabel(kind);

            return (
              <Fragment key={`vault-section-${index}`}>
                <div className="flex items-center justify-between pr-1">
                  <Item.SectionHeader
                    label={sectionLabel}
                    variant="secondary"
                  />
                  {sectionLabel === "VAULTS" &&
                    isAdmin &&
                    setShowVaultCreationModal && (
                      <Button
                        className="mt-4"
                        size="xs"
                        variant="tertiary"
                        label="Create Vault"
                        icon={PlusIcon}
                        onClick={() => setShowVaultCreationModal(true)}
                      />
                    )}
                </div>
                {renderVaultItems(
                  vaults.toSorted(compareVaults),
                  vaultsAsUser,
                  owner
                )}
              </Fragment>
            );
          })}
        </Item.List>
      </div>
    </div>
  );
}

// Function to render vault items.
const renderVaultItems = (
  vaults: VaultType[],
  vaultsAsUser: VaultType[],
  owner: LightWorkspaceType
) => {
  return vaults.map((vault) => (
    <Fragment key={`vault-${vault.sId}`}>
      {vault.kind === "system" ? (
        <SystemVaultMenu owner={owner} vault={vault} />
      ) : (
        <VaultMenu
          owner={owner}
          vault={vault}
          isMember={!!vaultsAsUser.find((v) => v.sId === vault.sId)}
        />
      )}
    </Fragment>
  ));
};

const getSectionLabel = (kind: VaultKind) => {
  switch (kind) {
    case "global":
      return "SHARED";

    case "regular":
      return "VAULTS";

    case "system":
      return "";

    case "public":
      return "PUBLIC";

    default:
      assertNever(kind);
  }
};

// System vault.

const SYSTEM_VAULTS_ITEMS = [
  {
    label: "Connection Admin",
    visual: CloudArrowLeftRightIcon,
    tailwindIconTextColor: "text-brand",
    category: "managed" as DataSourceViewCategory,
  },
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
          category={item.category as Exclude<DataSourceViewCategory, "apps">}
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
  category: Exclude<DataSourceViewCategory, "apps">;
  label: string;
  owner: LightWorkspaceType;
  vault: VaultType;
  visual: IconType;
  tailwindIconTextColor: string;
}) => {
  const router = useRouter();

  const itemPath = `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}`;
  const isAncestorToCurrentPage =
    router.asPath.startsWith(itemPath + "/") || router.asPath === itemPath;

  // Unfold the item if it's an ancestor of the current page.
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (isAncestorToCurrentPage) {
      setIsExpanded(isAncestorToCurrentPage);
    }
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

const VaultMenu = ({
  owner,
  vault,
  isMember,
}: {
  owner: LightWorkspaceType;
  vault: VaultType;
  isMember: boolean;
}) => {
  return (
    <Tree variant="navigator">
      <VaultMenuItem owner={owner} vault={vault} isMember={isMember} />
    </Tree>
  );
};

const VaultMenuItem = ({
  owner,
  vault,
  isMember,
}: {
  owner: LightWorkspaceType;
  vault: VaultType;
  isMember: boolean;
}) => {
  const router = useRouter();

  const vaultPath = `/w/${owner.sId}/vaults/${vault.sId}`;
  const isAncestorToCurrentPage =
    router.asPath.startsWith(vaultPath + "/") || router.asPath === vaultPath;

  // Unfold the vault if it's an ancestor of the current page.
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (isAncestorToCurrentPage) {
      setIsExpanded(isAncestorToCurrentPage);
    }
  }, [isAncestorToCurrentPage]);

  const { vaultInfo, isVaultInfoLoading } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
    disabled: !isExpanded,
  });

  return (
    <Tree.Item
      isNavigatable
      label={getVaultName(vault)}
      collapsed={!isExpanded}
      onItemClick={() => router.push(vaultPath)}
      isSelected={router.asPath === vaultPath}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      visual={getVaultIcon(vault)}
      tailwindIconTextColor={isMember ? "text-success-500" : "text-warning-400"}
      size="md"
      areActionsFading={false}
    >
      {isExpanded && (
        <Tree isLoading={isVaultInfoLoading}>
          {vaultInfo?.categories &&
            DATA_SOURCE_VIEW_CATEGORIES.filter(
              (c) => !!vaultInfo.categories[c]
            ).map((c) => {
              if (c === "apps") {
                return (
                  <VaultAppSubMenu
                    key={c}
                    category={c}
                    owner={owner}
                    vault={vault}
                  />
                );
              } else {
                return (
                  vaultInfo.categories[c] && (
                    <VaultDataSourceViewSubMenu
                      key={c}
                      category={c}
                      owner={owner}
                      vault={vault}
                    />
                  )
                );
              }
            })}
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
  node,
}: {
  item: DataSourceViewType;
  owner: LightWorkspaceType;
  vault: VaultType;
  node?: DataSourceViewContentNode;
}): ReactElement => {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  const { isNodesLoading, nodes } = useDataSourceViewContentNodes({
    dataSourceView: item,
    owner,
    parentId: node?.internalId,
    viewType: "documents",
    disabled: !isExpanded,
    swrOptions: {
      revalidateOnFocus: false,
    },
  });

  const basePath = `/w/${owner.sId}/vaults/${vault.sId}/categories/${item.category}/data_source_views/${item.sId}`;

  // Load the currently selected node from router.query.parentId
  const {
    nodes: [selected],
  } = useDataSourceViewContentNodes({
    dataSourceView: item,
    owner,
    internalIds: [router.query.parentId as string],
    viewType: "documents",
    disabled: !router.asPath.startsWith(basePath) || !router.query.parentId,
  });

  // isAncestorToCurrentPage is true if :
  // 1. The current path matches the basePath
  // 2. Either the current node is the root (!node) or the current node is a parent of the selected node
  const isAncestorToCurrentPage =
    router.asPath.startsWith(basePath) &&
    (!node || (node && selected?.parentInternalIds?.includes(node.internalId)));

  // Unfold the folder if it's an ancestor of the current page.
  useEffect(() => {
    if (isAncestorToCurrentPage) {
      setIsExpanded(isAncestorToCurrentPage);
    }
  }, [isAncestorToCurrentPage]);

  const LogoComponent = node
    ? getVisualForContentNode(node)
    : getConnectorProviderLogoWithFallback(
        item.dataSource.connectorProvider,
        FolderIcon
      );

  const dataSourceViewPath = node
    ? `${basePath}?parentId=${node?.internalId}`
    : basePath;

  const isEmpty = isExpanded && !isNodesLoading && nodes.length === 0;
  const folders = nodes.filter((node) => node.expandable);
  const notFolders = nodes.filter((node) => !node.expandable);
  const itemsLabel = notFolders.length === 1 ? "item" : "items";

  return (
    <Tree.Item
      isNavigatable
      type={isEmpty ? "leaf" : "node"}
      isSelected={router.asPath === dataSourceViewPath}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      onItemClick={() => router.push(dataSourceViewPath)}
      collapsed={!isExpanded || isEmpty}
      label={node ? node.title : getDataSourceNameFromView(item)}
      visual={LogoComponent}
      areActionsFading={false}
    >
      {isExpanded && (
        <Tree isLoading={isNodesLoading}>
          {folders.map((node) => (
            <VaultDataSourceViewItem
              item={item}
              key={node.internalId}
              owner={owner}
              vault={vault}
              node={node}
            />
          ))}
          {notFolders.length > 0 && (
            <Tree.Empty
              label={`+ ${notFolders.length} ${folders.length > 0 ? "other " : ""} ${itemsLabel}`}
            />
          )}
        </Tree>
      )}
    </Tree.Item>
  );
};

const VaultDataSourceViewSubMenu = ({
  owner,
  vault,
  category,
}: {
  owner: LightWorkspaceType;
  vault: VaultType;
  category: Exclude<DataSourceViewCategory, "apps">;
}) => {
  const router = useRouter();

  const vaultCategoryPath = `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}`;
  const isAncestorToCurrentPage =
    router.asPath.startsWith(vaultCategoryPath + "/") ||
    router.asPath === vaultCategoryPath;

  // Unfold the vault's category if it's an ancestor of the current page.
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (isAncestorToCurrentPage) {
      setIsExpanded(isAncestorToCurrentPage);
    }
  }, [isAncestorToCurrentPage]);

  const categoryDetails = DATA_SOURCE_OR_VIEW_SUB_ITEMS[category];
  const { isVaultDataSourceViewsLoading, vaultDataSourceViews } =
    useVaultDataSourceViews({
      workspaceId: owner.sId,
      vaultId: vault.sId,
      category,
    });
  const sortedViews = useMemo(() => {
    return vaultDataSourceViews.sort((a, b) =>
      getDataSourceNameFromView(a).localeCompare(getDataSourceNameFromView(b))
    );
  }, [vaultDataSourceViews]);

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
      type={
        isVaultDataSourceViewsLoading || vaultDataSourceViews.length > 0
          ? "node"
          : "leaf"
      }
    >
      {isExpanded && (
        <Tree isLoading={isVaultDataSourceViewsLoading}>
          {sortedViews.map((ds) => (
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

const VaultAppItem = ({
  app,
  owner,
}: {
  app: AppType;
  owner: LightWorkspaceType;
}): ReactElement => {
  const router = useRouter();

  const appPath = `/w/${owner.sId}/vaults/${app.vault.sId}/apps/${app.sId}`;

  return (
    <Tree.Item
      isNavigatable
      type="leaf"
      isSelected={
        router.asPath === appPath ||
        router.asPath.includes(appPath + "/") ||
        router.asPath.includes(appPath + "?")
      }
      onItemClick={() => router.push(appPath)}
      label={app.name}
      visual={CommandLineIcon}
      areActionsFading={false}
    />
  );
};

const VaultAppSubMenu = ({
  owner,
  vault,
  category,
}: {
  owner: LightWorkspaceType;
  vault: VaultType;
  category: "apps";
}) => {
  const router = useRouter();

  const vaultCategoryPath = `/w/${owner.sId}/vaults/${vault.sId}/categories/${category}`;
  const isAncestorToCurrentPage =
    router.asPath.startsWith(vaultCategoryPath + "/") ||
    router.asPath === vaultCategoryPath;

  // Unfold the vault's category if it's an ancestor of the current page.
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (isAncestorToCurrentPage) {
      setIsExpanded(isAncestorToCurrentPage);
    }
  }, [isAncestorToCurrentPage]);

  const categoryDetails = DATA_SOURCE_OR_VIEW_SUB_ITEMS[category];

  const { isAppsLoading, apps } = useApps({
    owner,
    vault,
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
      type={isAppsLoading || apps.length > 0 ? "node" : "leaf"}
    >
      {isExpanded && (
        <Tree isLoading={isAppsLoading}>
          {sortBy(apps, "name").map((app) => (
            <VaultAppItem app={app} key={app.sId} owner={owner} />
          ))}
        </Tree>
      )}
    </Tree.Item>
  );
};
