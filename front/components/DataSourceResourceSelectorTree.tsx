import {
  ChatBubbleLeftRightIcon,
  Checkbox,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { CircleStackIcon, FolderIcon } from "@heroicons/react/20/solid";
import { useState } from "react";

import {
  ConnectorPermission,
  ConnectorResourceType,
} from "@app/lib/connectors_api";
import { useConnectorPermissions } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { WorkspaceType } from "@app/types/user";

export default function DataSourceResourceSelectorTree({
  owner,
  dataSource,
  expandable, //if not, it's flat
  selectedParentIds,
  onSelectChange,
  parentsById,
  fullySelected,
  filterPermission = "read",
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  expandable: boolean;
  selectedParentIds: Set<string>;
  onSelectChange: (
    resource: { resourceId: string; resourceName: string; parents: string[] },
    selected: boolean
  ) => void;
  parentsById: Record<string, Set<string>>;
  fullySelected: boolean;
  filterPermission?: ConnectorPermission;
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
      />
    </div>
  );
}

export type IconComponentType =
  | typeof DocumentTextIcon
  | typeof FolderIcon
  | typeof CircleStackIcon
  | typeof ChatBubbleLeftRightIcon;

function getIconForType(type: ConnectorResourceType): IconComponentType {
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
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  expandable: boolean;
  isChecked: boolean;
  selectedParentIds: Set<string>;
  parents: string[];
  onSelectChange: (
    resource: { resourceId: string; resourceName: string; parents: string[] },
    selected: boolean
  ) => void;
  parentsById: Record<string, Set<string>>;
  fullySelected: boolean;
  filterPermission: ConnectorPermission;
}) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions({
      owner: owner,
      dataSource,
      parentId,
      filterPermission,
      disabled: dataSource.connectorId === null,
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

  return (
    <>
      {isResourcesLoading ? (
        <Spinner />
      ) : (
        <div className="flex-1 space-y-1">
          {resources.map((r) => {
            const IconComponent = getIconForType(r.type);
            const titlePrefix = r.type === "channel" ? "#" : "";
            const checkStatus = getCheckStatus(r.internalId);
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
                  <span className="ml-2 line-clamp-1 text-sm font-medium text-element-900">{`${titlePrefix}${r.title}`}</span>
                  <div className="ml-32 flex-grow">
                    <Checkbox
                      variant="checkable"
                      className={classNames(
                        "ml-auto",
                        checkStatus === "partial" ? "bg-element-600" : ""
                      )}
                      checked={checkStatus === "checked"}
                      partialChecked={checkStatus === "partial"}
                      onChange={(checked) =>
                        onSelectChange(
                          {
                            resourceId: r.internalId,
                            resourceName: r.title,
                            parents: parents,
                          },
                          checked
                        )
                      }
                      disabled={isChecked || fullySelected}
                    />
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
