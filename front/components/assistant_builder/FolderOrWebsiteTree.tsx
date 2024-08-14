import { FolderIcon, GlobeAltIcon, Tree } from "@dust-tt/sparkle";
import type {
  ContentNode,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";

import type { AssistantBuilderDataSourceConfiguration } from "@app/components/assistant_builder/types";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { useParentResourcesById } from "@app/hooks/useParentResourcesById";

export default function FolderOrWebsiteTree({
  owner,
  dataSource,
  type,
  currentConfig,
  onSelectChange,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  type: "folder" | "website";
  currentConfig: AssistantBuilderDataSourceConfiguration | undefined;
  onSelectChange: (
    ds: DataSourceType,
    selected: boolean,
    resource?: ContentNode
  ) => void;
}) {
  const selectedResources = currentConfig?.selectedResources ?? [];

  const { parentsById, setParentsById } = useParentResourcesById({
    owner,
    dataSource,
    selectedResources,
  });

  const selectedParents = [
    ...new Set(Object.values(parentsById).flatMap((c) => [...c])),
  ];

  return (
    <Tree.Item
      type={type === "folder" ? "leaf" : "node"}
      label={dataSource.name}
      variant="folder"
      visual={type === "folder" ? <FolderIcon /> : <GlobeAltIcon />}
      className="whitespace-nowrap"
      checkbox={{
        checked: currentConfig?.isSelectAll ?? false,
        partialChecked: currentConfig
          ? !currentConfig.isSelectAll &&
            currentConfig.selectedResources?.length > 0
          : false,
        onChange: (checked) => {
          setParentsById({});
          onSelectChange(dataSource, checked);
        },
      }}
    >
      {type === "website" && (
        <DataSourceResourceSelectorTree
          showExpand
          owner={owner}
          dataSource={dataSource}
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
            onSelectChange(dataSource, selected, resource);
          }}
          selectedResourceIds={selectedResources.map((r) => r.internalId)}
        />
      )}
    </Tree.Item>
  );
}
