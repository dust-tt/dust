import { Breadcrumbs, CloudArrowLeftRightIcon } from "@dust-tt/sparkle";
import type {
  DataSourceViewCategory,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@dust-tt/types";
import Link from "next/link";
import React from "react";

import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { CATEGORY_DETAILS, getSpaceIcon } from "@app/lib/spaces";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";

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
    nodes: [currentFolder],
  } = useDataSourceViewContentNodes({
    owner,
    dataSourceView: parentId ? dataSourceView : undefined,
    internalIds: parentId ? [parentId] : [],
    viewType: "all",
  });

  const { nodes: folders } = useDataSourceViewContentNodes({
    dataSourceView: currentFolder ? dataSourceView : undefined,
    internalIds: currentFolder?.parentInternalIds ?? [],
    owner,
    viewType: "all",
  });

  const items = React.useMemo(() => {
    // If at root level, show the space name.
    if (!category) {
      return [
        {
          icon: getSpaceIcon(space),
          label: space.kind === "global" ? "Company Data" : space.name,
        },
      ];
    }

    const items: {
      label: string;
      icon?: React.ComponentType;
      href?: string;
    }[] = [
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
      if (!dataSourceView) {
        return [
          {
            icon: CloudArrowLeftRightIcon,
            label: "Connection Admin",
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

  const description = React.useMemo(() => {
    if (category === "managed") {
      return (
        <>
          Here you can authorize Connections and control what data Dust can
          access. Once connected, data can be distributed to Open Spaces
          (accessible to all workspace members) or Restricted Spaces (limited
          access). <br />
          Need help? Check out our{" "}
          <Link
            href="https://docs.dust.tt/docs/data"
            className="text-highlight"
            target="_blank"
          >
            guide
          </Link>
        </>
      );
    }

    return null;
  }, [category]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 py-4">
      <Breadcrumbs items={items} />
      {description && (
        <div className="text-sm text-muted-foreground">{description}</div>
      )}
    </div>
  );
}
