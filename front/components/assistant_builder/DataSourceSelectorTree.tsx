import { Tree } from "@dust-tt/sparkle";
import type {
  ContentNode,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

import { useConnectorPermissions } from "@app/lib/swr";

export function DataSourceSelectorTreeChildren({
  owner,
  dataSource,
  parentId,
  parentIsSelected,
  showExpand,
  selectedValues,
  onChange,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  parentIsSelected?: boolean;
  showExpand?: boolean;
  selectedValues: ContentNode[];
  onChange: (resource: ContentNode, checked: boolean) => void;
}) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions({
      owner,
      dataSource,
      parentId,
      filterPermission: "read",
    });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isResourcesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve permissions likely due to a revoked authorization.
      </div>
    );
  }

  useEffect(() => {
    if (parentIsSelected) {
      // Unselected previously selected children
      resources
        .filter((r) =>
          selectedValues.find((value) => value.internalId === r.internalId)
        )
        .forEach((r) => {
          onChange(r, false);
        });
    }
  }, [resources, parentIsSelected, selectedValues, onChange]);

  return (
    <Tree isLoading={isResourcesLoading}>
      {resources.map((r) => {
        const isSelected = Boolean(
          selectedValues.find((value) => value.internalId === r.internalId)
        );
        return (
          <Tree.Item
            key={r.internalId}
            collapsed={!expanded[r.internalId]}
            onChevronClick={() => {
              setExpanded((prev) => ({
                ...prev,
                [r.internalId]: prev[r.internalId] ? false : true,
              }));
            }}
            type={r.expandable ? "node" : "leaf"}
            label={r.title}
            variant={r.type}
            className="whitespace-nowrap"
            checkbox={
              r.preventSelection !== true
                ? {
                    disabled: parentIsSelected,
                    checked: parentIsSelected || isSelected,
                    onChange: (checked) => {
                      onChange(r, checked);
                    },
                  }
                : undefined
            }
          >
            {expanded[r.internalId] && (
              <DataSourceSelectorTreeChildren
                owner={owner}
                dataSource={dataSource}
                parentId={r.internalId}
                showExpand={showExpand}
                parentIsSelected={parentIsSelected || isSelected}
                selectedValues={selectedValues}
                onChange={onChange}
              />
            )}
          </Tree.Item>
        );
      })}
    </Tree>
  );
}

export function DataSourceSelectorTree({
  owner,
  dataSource,
  showExpand,
  parentIsSelected,
  selectedValues,
  onChange,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  showExpand?: boolean;
  parentIsSelected?: boolean;
  selectedValues: ContentNode[];
  onChange: (resource: ContentNode, checked: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <DataSourceSelectorTreeChildren
        owner={owner}
        dataSource={dataSource}
        parentId={null}
        showExpand={showExpand}
        parentIsSelected={parentIsSelected}
        selectedValues={selectedValues}
        onChange={onChange}
      />
    </div>
  );
}
