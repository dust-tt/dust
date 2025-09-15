import Link from "next/dist/client/link";
import React from "react";

import { SpaceBreadCrumbs } from "@app/components/spaces/SpaceBreadcrumb";
import type { DataSourceViewType } from "@app/types";
import type {
  DataSourceViewCategory,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

export const ACTION_BUTTONS_CONTAINER_ID = "space-action-buttons-container";
export const TRIGGER_BUTTONS_CONTAINER_ID = "space-trigger-buttons-container";

interface SpacePageToolsProps {
  category: DataSourceViewCategory | undefined;
  dataSourceView: DataSourceViewType | undefined;
  owner: LightWorkspaceType;
  parentId: string | undefined;
  space: SpaceType;
}

export function SpacePageHeader({
  category,
  dataSourceView,
  owner,
  parentId,
  space,
}: SpacePageToolsProps) {
  const description = React.useMemo(() => {
    if (space.kind === "system") {
      if (category === "managed" && !dataSourceView) {
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
            .
          </>
        );
      } else {
        return null;
      }
    }

    return null;
  }, [category, dataSourceView, space.kind]);

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex h-9 w-full items-center justify-between gap-2">
        <SpaceBreadCrumbs
          space={space}
          category={category}
          owner={owner}
          dataSourceView={dataSourceView}
          parentId={parentId}
        />
        <div>
          <div id={ACTION_BUTTONS_CONTAINER_ID} className="flex gap-2" />
          <div id={TRIGGER_BUTTONS_CONTAINER_ID} className="flex gap-2" />
        </div>
      </div>
      {description && (
        <div className="text-sm text-muted-foreground">{description}</div>
      )}
    </div>
  );
}
