import type { BreadcrumbItem } from "@dust-tt/sparkle";
import {
  BoltIcon,
  Breadcrumbs,
  CloudArrowLeftRightIcon,
  ToolsIcon,
} from "@dust-tt/sparkle";
import React from "react";

import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { CATEGORY_DETAILS, getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type {
  DataSourceViewCategory,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

interface SpaceBreadcrumbProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  category?: DataSourceViewCategory;
  dataSourceView?: DataSourceViewType;
  parentId?: string;
}

export function SpaceBreadCrumbs({
  owner,
  space,
  category,
  dataSourceView,
  parentId,
}: SpaceBreadcrumbProps) {
  const {
    nodes: [currentNavigationItem],
  } = useDataSourceViewContentNodes({
    owner,
    dataSourceView: parentId ? dataSourceView : undefined,
    internalIds: parentId ? [parentId] : [],
    viewType: "all",
  });

  const { nodes: folders } = useDataSourceViewContentNodes({
    dataSourceView: currentNavigationItem ? dataSourceView : undefined,
    internalIds: currentNavigationItem?.parentInternalIds ?? [],
    owner,
    viewType: "all",
  });

  const items = React.useMemo(() => {
    // If at root level, show the space name.
    if (!category) {
      return [
        {
          icon: getSpaceIcon(space),
          label: getSpaceName(space),
        },
      ];
    }

    const items: BreadcrumbItem[] = [
      {
        icon: getSpaceIcon(space),
        label: space.kind === "global" ? "Company Data" : space.name,
        href: `/w/${owner.sId}/spaces/${space.sId}`,
      },
      {
        label: CATEGORY_DETAILS[category].label,
        href: `/w/${owner.sId}/spaces/${space.sId}/categories/${category}`,
      },
    ];

    if (space.kind === "system") {
      // Root managed connection in system space.
      switch (category) {
        case "managed": {
          if (dataSourceView === undefined) {
            return [
              {
                icon: CloudArrowLeftRightIcon,
                label: "Connections Admin",
              },
            ];
          }
          break;
        }
        case "actions":
          return [
            {
              icon: ToolsIcon,
              label: "Tools",
            },
          ];
        case "triggers":
          return [
            {
              icon: BoltIcon,
              label: "Triggers",
            },
          ];
      }

      // For system space, we don't want the first breadcrumb to show, since
      // it's only used to manage "connected data" already. Otherwise it would
      // expose a useless link, and name would be redundant with the "Connected
      // data" label.
      items.shift();
    }

    if (dataSourceView) {
      if (category === "managed" && space.kind !== "system") {
        // Remove the "Connected data" from breadcrumbs to avoid hiding the actual
        // managed connection name.

        // Showing the actual managed connection name (e.g. microsoft, slack...) is
        // more important and implies clearly that we are dealing with connected
        // data.
        items.pop();
      }

      items.push({
        label: getDataSourceNameFromView(dataSourceView),
        href: `/w/${owner.sId}/spaces/${space.sId}/categories/${category}/data_source_views/${dataSourceView.sId}`,
      });

      for (const node of [...folders].reverse()) {
        items.push({
          label: node.title,
          href: `/w/${owner.sId}/spaces/${space.sId}/categories/${category}/data_source_views/${dataSourceView.sId}?parentId=${node.internalId}`,
        });
      }
    }
    return items;
  }, [owner, space, category, dataSourceView, folders]);

  if (items.length === 0) {
    return null;
  }

  return <Breadcrumbs items={items} />;
}
