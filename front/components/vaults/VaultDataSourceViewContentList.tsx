import { DataTable, Searchbar, Spinner } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRef, useState } from "react";

import type { ContentActionsRef } from "@app/components/vaults/ContentActions";
import {
  ContentActions,
  getMenuItems,
} from "@app/components/vaults/ContentActions";
import { FoldersHeaderMenu } from "@app/components/vaults/FoldersHeaderMenu";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import { isFolder } from "@app/lib/data_sources";
import { useDataSourceViewContentNodes } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  internalId: string;
  icon: React.ComponentType;
  title: string;
  expandable: boolean;
  lastUpdatedAt: number | null;
  onClick?: () => void;
};

type VaultDataSourceViewContentListProps = {
  dataSourceView: DataSourceViewType;
  plan: PlanType;
  isAdmin: boolean;
  onSelect: (parentId: string) => void;
  owner: WorkspaceType;
  parentId?: string;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "title",
      id: "title",
      sortingFn: "text", // built-in sorting function case-insensitive
      cell: (info: CellContext<RowData, unknown>) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          <span className="font-bold">{info.row.original.title}</span>
        </DataTable.CellContent>
      ),
    },
  ];
};

export const VaultDataSourceViewContentList = ({
  dataSourceView,
  plan,
  isAdmin,
  onSelect,
  owner,
  parentId,
}: VaultDataSourceViewContentListProps) => {
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const contentActionsRef = useRef<ContentActionsRef>(null);

  const { isNodesLoading, mutateDataSourceViewContentNodes, nodes } =
    useDataSourceViewContentNodes({
      dataSourceView,
      owner,
      internalIds: parentId ? [parentId] : [],
      includeChildren: true,
      viewType: "documents",
    });

  const rows: RowData[] =
    nodes?.map((contentNode) => ({
      ...contentNode,
      icon: getVisualForContentNode(contentNode),
      onClick: () => {
        if (contentNode.expandable) {
          onSelect(contentNode.internalId);
        }
      },
      moreMenuItems: getMenuItems(
        dataSourceView,
        contentNode,
        contentActionsRef
      ),
    })) || [];

  if (isNodesLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div
        className={classNames(
          "flex gap-2",
          rows.length === 0 && isAdmin
            ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
            : ""
        )}
      >
        {rows.length > 0 && (
          <>
            <Searchbar
              name="search"
              placeholder="Search (Name)"
              value={dataSourceSearch}
              onChange={(s) => {
                setDataSourceSearch(s);
              }}
            />
          </>
        )}
        {isFolder(dataSourceView.dataSource) && (
          <FoldersHeaderMenu contentActionsRef={contentActionsRef} />
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn="title"
          initialColumnOrder={[{ desc: false, id: "title" }]}
        />
      )}
      <ContentActions
        ref={contentActionsRef}
        dataSourceView={dataSourceView}
        owner={owner}
        plan={plan}
        onSave={mutateDataSourceViewContentNodes}
      />
    </>
  );
};
