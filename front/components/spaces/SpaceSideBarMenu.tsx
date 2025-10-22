import {
  BoltIcon,
  Button,
  CloudArrowLeftRightIcon,
  CommandLineIcon,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  PlusIcon,
  ToolsIcon,
  Tree,
} from "@dust-tt/sparkle";
import type { ReturnTypeOf } from "@octokit/core/types";
import sortBy from "lodash/sortBy";
import uniqBy from "lodash/uniqBy";
import { useRouter } from "next/router";
import type { ComponentType, ReactElement } from "react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { usePersistedNavigationSelection } from "@app/hooks/usePersistedNavigationSelection";
import { useSpaceSidebarItemFocus } from "@app/hooks/useSpaceSidebarItemFocus";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import type { SpaceSectionGroupType } from "@app/lib/spaces";
import {
  CATEGORY_DETAILS,
  getSpaceIcon,
  getSpaceName,
  groupSpacesForDisplay,
} from "@app/lib/spaces";
import { useApps } from "@app/lib/swr/apps";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import {
  useSpaceDataSourceViews,
  useSpaceInfo,
  useSpaces,
  useSpacesAsAdmin,
} from "@app/lib/swr/spaces";
import { useWebhookSourceViews } from "@app/lib/swr/webhook_source";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import type {
  AppType,
  DataSourceViewCategory,
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
  WhitelistableFeature,
} from "@app/types";
import { assertNever, DATA_SOURCE_VIEW_CATEGORIES } from "@app/types";

interface SpaceSideBarMenuProps {
  owner: LightWorkspaceType;
  isAdmin: boolean;
  openSpaceCreationModal?: ({
    defaultRestricted,
  }: {
    defaultRestricted: boolean;
  }) => void;
}

export default function SpaceSideBarMenu({
  owner,
  isAdmin,
  openSpaceCreationModal,
}: SpaceSideBarMenuProps) {
  const { spaces: spacesAsAdmin, isSpacesLoading: isSpacesAsAdminLoading } =
    useSpacesAsAdmin({
      workspaceId: owner.sId,
      disabled: !isAdmin,
    });

  const { spaces: spacesAsUser, isSpacesLoading: isSpacesAsUserLoading } =
    useSpaces({
      workspaceId: owner.sId,
    });

  const compareSpaces = useCallback(
    (s1: SpaceType, s2: SpaceType) => {
      const s1IsMember = !!spacesAsUser.find((s) => s.sId === s1.sId);
      const s2IsMember = !!spacesAsUser.find((s) => s.sId === s2.sId);

      if (s1IsMember && !s2IsMember) {
        return -1;
      } else if (!s1IsMember && s2IsMember) {
        return 1;
      } else {
        return s1.name.localeCompare(s2.name);
      }
    },
    [spacesAsUser]
  );

  const spaces = useMemo(() => {
    return uniqBy(spacesAsAdmin.concat(spacesAsUser), "sId");
  }, [spacesAsAdmin, spacesAsUser]);

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  if (isSpacesAsAdminLoading || isSpacesAsUserLoading || !spacesAsUser) {
    return <></>;
  }

  const sortedGroupedSpaces = groupSpacesForDisplay(spaces).filter(
    ({ section, spaces }) => section !== "system" || spaces.length !== 0
  );

  // Function to render space items.
  const renderSpaceItems = (
    spaces: SpaceType[],
    spacesAsUser: SpaceType[],
    owner: LightWorkspaceType
  ) => {
    return spaces.map((space) => (
      <Fragment key={`space-${space.sId}`}>
        {space.kind === "system" ? (
          <SystemSpaceMenu
            owner={owner}
            space={space}
            hasFeature={hasFeature}
          />
        ) : (
          <SpaceMenu
            owner={owner}
            space={space}
            isMember={!!spacesAsUser.find((v) => v.sId === space.sId)}
            hasFeature={hasFeature}
          />
        )}
      </Fragment>
    ));
  };

  return (
    <div className="flex h-0 min-h-full w-full overflow-y-auto">
      <NavigationList className="w-full px-3">
        {sortedGroupedSpaces.map(({ section, spaces }, index) => {
          if (section === "public" && !spaces.length) {
            return null;
          }

          if (section === "restricted" && !spaces.length && !isAdmin) {
            return null;
          }

          const sectionDetails = getSpaceSectionDetails(section);

          return (
            <Fragment key={`space-section-${index}`}>
              <div className="flex items-center justify-between pr-1">
                <NavigationListLabel
                  label={sectionDetails.label}
                  variant="primary"
                />
                {sectionDetails.displayCreateSpaceButton &&
                  isAdmin &&
                  openSpaceCreationModal && (
                    <Button
                      className="mt-1"
                      size="xs"
                      variant="ghost"
                      label="New"
                      icon={PlusIcon}
                      onClick={() =>
                        openSpaceCreationModal({
                          defaultRestricted: sectionDetails.defaultRestricted,
                        })
                      }
                    />
                  )}
              </div>
              {renderSpaceItems(
                spaces.toSorted(compareSpaces),
                spacesAsUser,
                owner
              )}
            </Fragment>
          );
        })}
      </NavigationList>
    </div>
  );
}

type SpaceSectionStructureType =
  | {
      label: string;
      displayCreateSpaceButton: true;
      defaultRestricted: boolean;
    }
  | {
      label: string;
      displayCreateSpaceButton: false;
    };

const getSpaceSectionDetails = (
  kind: SpaceSectionGroupType
): SpaceSectionStructureType => {
  switch (kind) {
    case "shared":
      return {
        label: "Open Spaces",
        displayCreateSpaceButton: true,
        defaultRestricted: false,
      };

    case "restricted":
      return {
        label: "Restricted Spaces",
        displayCreateSpaceButton: true,
        defaultRestricted: true,
      };

    case "system":
      return { label: "Administration", displayCreateSpaceButton: false };

    case "public":
      return { label: "Public", displayCreateSpaceButton: false };

    default:
      assertNever(kind);
  }
};

// System space.

const SYSTEM_SPACE_ITEMS: {
  label: string;
  visual: IconType;
  category: DataSourceViewCategory;
  flag: WhitelistableFeature | null;
}[] = [
  {
    label: "Connections",
    visual: CloudArrowLeftRightIcon,
    category: "managed",
    flag: null,
  },
  {
    label: "Tools",
    visual: ToolsIcon,
    category: "actions",
    flag: null,
  },
  {
    label: "Triggers",
    visual: BoltIcon,
    category: "triggers",
    flag: "hootl_webhooks",
  },
];

const SystemSpaceMenu = ({
  owner,
  space,
  hasFeature,
}: {
  owner: LightWorkspaceType;
  space: SpaceType;
  hasFeature: ReturnTypeOf<typeof useFeatureFlags>["hasFeature"];
}) => {
  return (
    <NavigationList>
      {SYSTEM_SPACE_ITEMS.map((item) => {
        if (item.flag) {
          if (!hasFeature(item.flag)) {
            return null;
          }
        }

        return (
          <SystemSpaceItem
            category={item.category as DataSourceViewCategoryWithoutApps}
            key={item.label}
            label={item.label}
            owner={owner}
            space={space}
            visual={item.visual}
          />
        );
      })}
    </NavigationList>
  );
};

type IconType = ComponentType<{ className?: string }>;

const SystemSpaceItem = ({
  category,
  label,
  owner,
  space,
  visual,
}: {
  category: DataSourceViewCategoryWithoutApps;
  label: string;
  owner: LightWorkspaceType;
  space: SpaceType;
  visual: IconType;
}) => {
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useRouter();

  const itemPath = `/w/${owner.sId}/spaces/${space.sId}/categories/${category}`;

  return (
    <NavigationListItem
      label={label}
      onClick={async () => {
        void setNavigationSelection({
          lastSpaceId: space.sId,
          lastSpaceCategory: category,
        });
        void router.push(itemPath);
      }}
      selected={router.asPath === itemPath}
      icon={visual}
    />
  );
};

// Global + regular spaces.

const SpaceMenu = ({
  owner,
  space,
  isMember,
  hasFeature,
}: {
  owner: LightWorkspaceType;
  space: SpaceType;
  isMember: boolean;
  hasFeature: ReturnTypeOf<typeof useFeatureFlags>["hasFeature"];
}) => {
  return (
    <Tree variant="navigator">
      <SpaceMenuItem
        owner={owner}
        space={space}
        isMember={isMember}
        hasFeature={hasFeature}
      />
    </Tree>
  );
};

const SpaceMenuItem = ({
  owner,
  space,
  isMember,
  hasFeature,
}: {
  owner: LightWorkspaceType;
  space: SpaceType;
  isMember: boolean;
  hasFeature: ReturnTypeOf<typeof useFeatureFlags>["hasFeature"];
}) => {
  const router = useRouter();
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const spacePath = `/w/${owner.sId}/spaces/${space.sId}`;
  const { isExpanded, toggleExpanded, isSelected } = useSpaceSidebarItemFocus({
    path: spacePath,
  });

  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
    disabled: !isExpanded,
  });

  return (
    <Tree.Item
      isNavigatable
      label={getSpaceName(space)}
      collapsed={!isExpanded}
      onItemClick={async () => {
        await setNavigationSelection({
          lastSpaceId: space.sId,
          lastSpaceCategory: undefined,
        });
        void router.push(spacePath);
      }}
      isSelected={isSelected}
      onChevronClick={toggleExpanded}
      visual={getSpaceIcon(space)}
      tailwindIconTextColor={isMember ? undefined : "text-warning-400"}
      areActionsFading={false}
    >
      {isExpanded && (
        <Tree isLoading={isSpaceInfoLoading}>
          {spaceInfo?.categories &&
            DATA_SOURCE_VIEW_CATEGORIES.filter(
              (c) =>
                !!spaceInfo.categories[c] &&
                hasFeature(CATEGORY_DETAILS[c].flag)
            ).map((c) => {
              if (c === "apps") {
                return (
                  <SpaceAppSubMenu
                    key={c}
                    category={c}
                    owner={owner}
                    space={space}
                  />
                );
              } else if (c === "actions") {
                return (
                  <SpaceActionsSubMenu
                    key={c}
                    category={c}
                    owner={owner}
                    space={space}
                  />
                );
              } else if (c === "triggers") {
                return (
                  <SpaceTriggersSubMenu key={c} owner={owner} space={space} />
                );
              } else {
                return (
                  spaceInfo.categories[c] && (
                    <SpaceDataSourceViewSubMenu
                      key={c}
                      category={c}
                      owner={owner}
                      space={space}
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

const SpaceDataSourceViewItem = ({
  item,
  owner,
  space,
  node,
}: {
  item: DataSourceViewType;
  owner: LightWorkspaceType;
  space: SpaceType;
  node?: DataSourceViewContentNode;
}): ReactElement => {
  const { isDark } = useTheme();
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  const { isNodesLoading, nodes, totalNodesCountIsAccurate, totalNodesCount } =
    useDataSourceViewContentNodes({
      dataSourceView: item,
      owner,
      parentId: node?.internalId,
      viewType: "all",
      disabled: !isExpanded,
      swrOptions: {
        revalidateOnFocus: false,
      },
    });

  const basePath = `/w/${owner.sId}/spaces/${space.sId}/categories/${item.category}/data_source_views/${item.sId}`;

  // Load the currently selected node from router.query.parentId
  const {
    nodes: [selected],
  } = useDataSourceViewContentNodes({
    dataSourceView: item,
    owner,
    internalIds: [router.query.parentId as string],
    viewType: "all",
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
    ? getVisualForDataSourceViewContentNode(node)
    : getConnectorProviderLogoWithFallback({
        provider: item.dataSource.connectorProvider,
        isDark,
      });

  const dataSourceViewPath = node
    ? `${basePath}?parentId=${node?.internalId}`
    : basePath;

  const isEmpty = isExpanded && !isNodesLoading && nodes.length === 0;
  const expandableNodes = nodes.filter((node) => node.expandable);
  const hiddenNodesCount = Math.max(0, totalNodesCount - nodes.length);

  return (
    <Tree.Item
      isNavigatable
      className="dd-privacy-mask"
      type={isEmpty ? "leaf" : "node"}
      isSelected={router.asPath === dataSourceViewPath}
      onChevronClick={() => setIsExpanded(!isExpanded)}
      onItemClick={async () => {
        await setNavigationSelection({
          lastSpaceId: space.sId,
          lastSpaceCategory: item.category,
        });
        void router.push(dataSourceViewPath);
      }}
      collapsed={!isExpanded || isEmpty}
      label={node ? node.title : getDataSourceNameFromView(item)}
      visual={LogoComponent}
      areActionsFading={false}
    >
      {isExpanded && (
        <Tree isLoading={isNodesLoading}>
          {expandableNodes.map((node) => (
            <SpaceDataSourceViewItem
              item={item}
              key={node.internalId}
              owner={owner}
              space={space}
              node={node}
            />
          ))}
          {hiddenNodesCount > 0 && (
            <Tree.Empty
              label={`${expandableNodes.length > 0 ? "and " : ""}${hiddenNodesCount}${totalNodesCountIsAccurate ? "" : "+"} item${hiddenNodesCount > 1 ? "s" : ""}`}
              onItemClick={async () => {
                await setNavigationSelection({
                  lastSpaceId: space.sId,
                  lastSpaceCategory: item.category,
                });
                void router.push(dataSourceViewPath);
              }}
            />
          )}
        </Tree>
      )}
    </Tree.Item>
  );
};

const SpaceDataSourceViewSubMenu = ({
  owner,
  space,
  category,
}: {
  owner: LightWorkspaceType;
  space: SpaceType;
  category: DataSourceViewCategoryWithoutApps;
}) => {
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useRouter();

  const spaceCategoryPath = `/w/${owner.sId}/spaces/${space.sId}/categories/${category}`;
  const { isExpanded, toggleExpanded, isSelected } = useSpaceSidebarItemFocus({
    path: spaceCategoryPath,
  });

  const categoryDetails = CATEGORY_DETAILS[category];
  const { isSpaceDataSourceViewsLoading, spaceDataSourceViews } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId: space.sId,
      category,
    });
  const sortedViews = useMemo(() => {
    return spaceDataSourceViews.sort((a, b) =>
      getDataSourceNameFromView(a).localeCompare(getDataSourceNameFromView(b))
    );
  }, [spaceDataSourceViews]);

  return (
    <Tree.Item
      isNavigatable
      label={categoryDetails.label}
      collapsed={!isExpanded}
      onItemClick={async () => {
        await setNavigationSelection({
          lastSpaceId: space.sId,
          lastSpaceCategory: category,
        });
        void router.push(spaceCategoryPath);
      }}
      isSelected={isSelected}
      onChevronClick={toggleExpanded}
      visual={categoryDetails.icon}
      areActionsFading={false}
      type={
        isSpaceDataSourceViewsLoading || spaceDataSourceViews.length > 0
          ? "node"
          : "leaf"
      }
    >
      {isExpanded && (
        <Tree isLoading={isSpaceDataSourceViewsLoading}>
          {sortedViews.map((ds) => (
            <SpaceDataSourceViewItem
              item={ds}
              key={ds.sId}
              owner={owner}
              space={space}
            />
          ))}
        </Tree>
      )}
    </Tree.Item>
  );
};

const SpaceAppItem = ({
  app,
  owner,
}: {
  app: AppType;
  owner: LightWorkspaceType;
}): ReactElement => {
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useRouter();

  const appPath = `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}`;

  return (
    <Tree.Item
      isNavigatable
      type="leaf"
      isSelected={
        router.asPath === appPath ||
        router.asPath.includes(appPath + "/") ||
        router.asPath.includes(appPath + "?")
      }
      onItemClick={async () => {
        await setNavigationSelection({
          lastSpaceId: app.space.sId,
          lastSpaceCategory: "apps",
        });
        void router.push(appPath);
      }}
      label={app.name}
      visual={CommandLineIcon}
      areActionsFading={false}
    />
  );
};

const SpaceActionItem = ({
  action,
}: {
  action: MCPServerViewType;
  owner: LightWorkspaceType;
}): ReactElement => {
  return (
    <Tree.Item
      type="leaf"
      label={getMcpServerDisplayName(action.server)}
      visual={() => getAvatar(action.server, "xs")}
      areActionsFading={false}
    />
  );
};

const SpaceAppSubMenu = ({
  owner,
  space,
  category,
}: {
  owner: LightWorkspaceType;
  space: SpaceType;
  category: "apps";
}) => {
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useRouter();
  const spaceCategoryPath = `/w/${owner.sId}/spaces/${space.sId}/categories/${category}`;
  const { isExpanded, toggleExpanded, isSelected } = useSpaceSidebarItemFocus({
    path: spaceCategoryPath,
  });

  const categoryDetails = CATEGORY_DETAILS[category];

  const { isAppsLoading, apps } = useApps({
    owner,
    space,
  });

  return (
    <Tree.Item
      isNavigatable
      label={categoryDetails.label}
      collapsed={!isExpanded}
      onItemClick={async () => {
        await setNavigationSelection({
          lastSpaceId: space.sId,
          lastSpaceCategory: category,
        });
        void router.push(spaceCategoryPath);
      }}
      isSelected={isSelected}
      onChevronClick={toggleExpanded}
      visual={categoryDetails.icon}
      areActionsFading={false}
      type={isAppsLoading || apps.length > 0 ? "node" : "leaf"}
    >
      {isExpanded && (
        <Tree isLoading={isAppsLoading}>
          {sortBy(apps, "name").map((app) => (
            <SpaceAppItem app={app} key={app.sId} owner={owner} />
          ))}
        </Tree>
      )}
    </Tree.Item>
  );
};

const SpaceActionsSubMenu = ({
  owner,
  space,
  category,
}: {
  owner: LightWorkspaceType;
  space: SpaceType;
  category: "actions";
}) => {
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useRouter();
  const spaceCategoryPath = `/w/${owner.sId}/spaces/${space.sId}/categories/${category}`;
  const { isExpanded, toggleExpanded, isSelected } = useSpaceSidebarItemFocus({
    path: spaceCategoryPath,
  });

  const categoryDetails = CATEGORY_DETAILS[category];

  const { isMCPServerViewsLoading, serverViews } = useMCPServerViews({
    owner,
    space,
  });

  return (
    <Tree.Item
      isNavigatable
      label={categoryDetails.label}
      collapsed={!isExpanded}
      onItemClick={async () => {
        await setNavigationSelection({
          lastSpaceId: space.sId,
          lastSpaceCategory: category,
        });
        void router.push(spaceCategoryPath);
      }}
      isSelected={isSelected}
      onChevronClick={toggleExpanded}
      visual={categoryDetails.icon}
      areActionsFading={false}
      type={isMCPServerViewsLoading || serverViews.length > 0 ? "node" : "leaf"}
    >
      {isExpanded && (
        <Tree isLoading={isMCPServerViewsLoading}>
          {serverViews.map((serverView) => (
            <SpaceActionItem
              action={serverView}
              key={serverView.server.name}
              owner={owner}
            />
          ))}
        </Tree>
      )}
    </Tree.Item>
  );
};

const SpaceTriggerItem = ({
  label,
  icon,
}: {
  label: string;
  icon: InternalAllowedIconType | CustomResourceIconType | null | undefined;
}): ReactElement => {
  return (
    <Tree.Item
      type="leaf"
      label={label}
      visual={() => getAvatarFromIcon(normalizeWebhookIcon(icon), "xs")}
    />
  );
};

const TRIGGERS_CATEGORY: DataSourceViewCategory = "triggers";

const SpaceTriggersSubMenu = ({
  owner,
  space,
}: {
  owner: LightWorkspaceType;
  space: SpaceType;
}) => {
  const { setNavigationSelection } = usePersistedNavigationSelection();
  const router = useRouter();
  const spaceTriggersPath = `/w/${owner.sId}/spaces/${space.sId}/categories/${TRIGGERS_CATEGORY}`;
  const { isExpanded, toggleExpanded, isSelected } = useSpaceSidebarItemFocus({
    path: spaceTriggersPath,
  });
  const triggersCategoryDetails = CATEGORY_DETAILS[TRIGGERS_CATEGORY];

  const { webhookSourceViews, isWebhookSourceViewsLoading } =
    useWebhookSourceViews({
      owner,
      space,
      disabled: !isSelected,
    });

  return (
    <Tree.Item
      isNavigatable
      label={triggersCategoryDetails.label}
      collapsed={!isExpanded}
      onItemClick={async () => {
        await setNavigationSelection({
          lastSpaceId: space.sId,
          lastSpaceCategory: TRIGGERS_CATEGORY,
        });
        void router.push(spaceTriggersPath);
      }}
      isSelected={isSelected}
      onChevronClick={toggleExpanded}
      visual={triggersCategoryDetails.icon}
      areActionsFading={false}
      type={
        isWebhookSourceViewsLoading || webhookSourceViews.length > 0
          ? "node"
          : "leaf"
      }
    >
      {isExpanded && (
        <Tree isLoading={isWebhookSourceViewsLoading}>
          {webhookSourceViews.map((webhookView) => (
            <SpaceTriggerItem
              label={webhookView.customName}
              icon={webhookView.icon}
              key={webhookView.sId}
            />
          ))}
        </Tree>
      )}
    </Tree.Item>
  );
};
