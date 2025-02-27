import type { DataSourceViewType } from "@dust-tt/types";
import type {
  DataSourceViewCategory,
  LightWorkspaceType,
  SpaceType,
} from "@dust-tt/types";

import { SpaceBreadCrumbs } from "@app/components/spaces/SpaceBreadcrumb";

export const ACTION_BUTTONS_CONTAINER_ID = "space-action-buttons-container";

interface SpacePageToolsProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  category: DataSourceViewCategory | undefined;
  dataSourceView: DataSourceViewType | undefined;
  parentId: string | undefined;
}

export function SpacePageTools({
  owner,
  space,
  category,
  dataSourceView,
  parentId,
}: SpacePageToolsProps) {
  return (
    <>
      <SpaceBreadCrumbs
        space={space}
        category={category}
        owner={owner}
        dataSourceView={dataSourceView}
        parentId={parentId}
      />
      <div id={ACTION_BUTTONS_CONTAINER_ID} className="flex gap-2" />
    </>
  );
}
