import {
  ChatBubbleLeftRightIcon,
  Checkbox,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  Spinner2,
} from "@dust-tt/sparkle";
import type {
  ContentNode,
  ContentNodesViewType,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import type { ConnectorPermission, ContentNodeType } from "@dust-tt/types";
import { CircleStackIcon, FolderIcon } from "@heroicons/react/20/solid";
import { useState } from "react";

import { useConnectorPermissions } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

export default function DataSourceResourceSelectorTree({
  owner,
  dataSource,
  expandable, //if not, it's flat
  selectedParentIds,
  onSelectChange,
  parentsById,
  fullySelected,
  filterPermission = "read",
  viewType = "documents",
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  expandable: boolean;
  selectedParentIds: Set<string>;
  onSelectChange: (
    resource: ContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  parentsById: Record<string, Set<string>>;
  fullySelected: boolean;
  filterPermission?: ConnectorPermission;
  viewType?: ContentNodesViewType;
}) {
  return (
    <div className="overflow-x-auto">
      <DataSourceResourceSelectorChildren
        owner={owner}
        dataSource={dataSource}
        parentId={null}
        expandable={expandable}
        selectedParentIds={selectedParentIds}
        onSelectChange={onSelectChange}
        parentsById={parentsById}
        parents={[]}
        isChecked={false}
        fullySelected={fullySelected}
        filterPermission={filterPermission}
        viewType={viewType}
      />
    </div>
  );
}

export type IconComponentType =
  | typeof DocumentTextIcon
  | typeof FolderIcon
  | typeof CircleStackIcon
  | typeof ChatBubbleLeftRightIcon;

function getIconForType(type: ContentNodeType): IconComponentType {
  switch (type) {
    case "file":
      return DocumentTextIcon;
    case "folder":
      return FolderIcon;
    case "database":
      return CircleStackIcon;
    case "channel":
      return ChatBubbleLeftRightIcon;
    default:
      ((n: never) => {
        throw new Error("Unreachable " + n);
      })(type);
  }
}

function DataSourceResourceSelectorChildren({
  owner,
  dataSource,
  parentId,
  expandable,
  isChecked,
  selectedParentIds,
  onSelectChange,
  parentsById,
  parents,
  fullySelected,
  filterPermission,
  viewType = "documents",
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  expandable: boolean;
  isChecked: boolean;
  selectedParentIds: Set<string>;
  parents: string[];
  onSelectChange: (
    resource: ContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  parentsById: Record<string, Set<string>>;
  fullySelected: boolean;
  filterPermission: ConnectorPermission;
  viewType: ContentNodesViewType;
}) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions({
      owner: owner,
      dataSource,
      parentId,
      filterPermission,
      disabled: dataSource.connectorId === null,
      viewType,
    });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const getCheckStatus = (
    resourceId: string
  ): "checked" | "unchecked" | "partial" => {
    if (fullySelected || isChecked || selectedParentIds?.has(resourceId)) {
      return "checked";
    }

    for (const x of selectedParentIds) {
      if (parentsById?.[x]?.has(resourceId)) {
        return "partial";
      }
    }

    return "unchecked";
  };

  if (isResourcesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve resources likely due to a revoked authorization.
      </div>
    );
  }

  const isTablesView = viewType === "tables";

  return (
    <>
      {isResourcesLoading ? (
        <Spinner2 />
      ) : (
        <div className="flex-1 space-y-1">
          {resources.map((r) => {
            const IconComponent = getIconForType(r.type);
            const checkStatus = getCheckStatus(r.internalId);
            const checkable = !isTablesView || r.type === "database";
            const showCheckbox = checkable || checkStatus !== "unchecked";
            return (
              <div key={r.internalId}>
                <div className="flex flex-row items-center rounded-md p-1 text-sm transition duration-200 hover:bg-structure-100">
                  {expandable && (
                    <div className="mr-4">
                      {expanded[r.internalId] ? (
                        <ChevronDownIcon
                          className="h-5 w-5 cursor-pointer text-action-600"
                          onClick={() => {
                            setExpanded((prev) => ({
                              ...prev,
                              [r.internalId]: false,
                            }));
                          }}
                        />
                      ) : (
                        <ChevronRightIcon
                          className={classNames(
                            "h-5 w-5",
                            r.expandable
                              ? "cursor-pointer text-action-600"
                              : "cursor-not-allowed text-slate-300"
                          )}
                          onClick={() => {
                            if (r.expandable) {
                              setExpanded((prev) => ({
                                ...prev,
                                [r.internalId]: true,
                              }));
                            }
                          }}
                        />
                      )}
                    </div>
                  )}
                  <div>
                    <IconComponent className="h-5 w-5 text-slate-300" />
                  </div>
                  <span className="ml-2 line-clamp-1 text-sm font-medium text-element-900">
                    {r.title}
                  </span>
                  <div className="ml-32 flex-grow">
                    {showCheckbox && (
                      <Checkbox
                        variant="checkable"
                        className={classNames(
                          "ml-auto",
                          checkStatus === "partial" ? "bg-element-600" : ""
                        )}
                        checked={checkStatus === "checked"}
                        partialChecked={checkStatus === "partial"}
                        onChange={(checked) =>
                          onSelectChange(r, parents, checked)
                        }
                        disabled={isChecked || fullySelected || !checkable}
                      />
                    )}
                  </div>
                </div>
                {expanded[r.internalId] && (
                  <div className="flex flex-row">
                    <div className="ml-4" />
                    <DataSourceResourceSelectorChildren
                      owner={owner}
                      dataSource={dataSource}
                      parentId={r.internalId}
                      expandable={expandable}
                      isChecked={checkStatus === "checked"}
                      selectedParentIds={selectedParentIds}
                      onSelectChange={onSelectChange}
                      parentsById={parentsById}
                      parents={[...parents, r.internalId]}
                      fullySelected={fullySelected}
                      filterPermission={filterPermission}
                      viewType={viewType}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
