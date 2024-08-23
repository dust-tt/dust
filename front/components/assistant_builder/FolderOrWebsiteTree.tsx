import { FolderIcon, GlobeAltIcon, Tree } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  WorkspaceType,
} from "@dust-tt/types";

import type { AssistantBuilderDataSourceConfiguration } from "@app/components/assistant_builder/types";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";

function getCheckedStatus(
  config: AssistantBuilderDataSourceConfiguration | undefined
) {
  if (!config) {
    return false;
  }

  const { isSelectAll, selectedResources } = config;
  if (isSelectAll) {
    return true;
  }

  return selectedResources.length > 0 ? "partial" : false;
}

export default function FolderOrWebsiteTree({
  owner,
  dataSourceView,
  type,
  currentConfig,
  onSelectChange,
}: {
  owner: WorkspaceType;
  dataSourceView: DataSourceViewType;
  type: "folder" | "website";
  currentConfig: AssistantBuilderDataSourceConfiguration | undefined;
  onSelectChange: (
    dsView: DataSourceViewType,
    selected: boolean,
    resource?: LightContentNode
  ) => void;
}) {
  const selectedResources = currentConfig?.selectedResources ?? [];

  const { parentsById, setParentsById } = useParentResourcesById({
    owner,
    dataSource: dataSourceView.dataSource,
    internalIds: selectedResources.map((r) => r.internalId),
  });

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

  return (
    <Tree.Item
      type={type === "folder" ? "leaf" : "node"}
      label={dataSourceView.dataSource.name}
      visual={type === "folder" ? FolderIcon : GlobeAltIcon}
      className="whitespace-nowrap"
      checkbox={{
        checked: getCheckedStatus(currentConfig),
        onChange: (checked) => {
          setParentsById({});
          onSelectChange(dataSourceView, checked);
        },
      }}
    >
      {type === "website" && (
        <DataSourceResourceSelectorTree
          showExpand
          owner={owner}
          dataSourceView={dataSourceView}
          parentIsSelected={currentConfig?.isSelectAll ?? false}
          selectedParents={selectedParents}
          onSelectChange={(resource, parents, selected) => {
            setParentsById((parentsById) => {
              const newParentsById = { ...parentsById };
              if (selected) {
                newParentsById[resource.internalId] = new Set(parents);
              } else {
                delete newParentsById[resource.internalId];
              }
              return newParentsById;
            });
            onSelectChange(dataSourceView, selected, resource);
          }}
          selectedResourceIds={selectedResources.map((r) => r.internalId)}
        />
      )}
    </Tree.Item>
  );
}
