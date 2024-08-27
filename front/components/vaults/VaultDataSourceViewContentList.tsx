import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowUpIcon,
  DataTable,
  DocumentIcon,
  DocumentTextIcon,
  DropdownMenu,
  FolderIcon,
  PlusIcon,
  Searchbar,
  Spinner,
  TableIcon,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useRef, useState } from "react";

import type { ContentAction } from "@app/components/vaults/ContentActions";
import {
  ContentActions,
  ContentActionsRef,
  getMenuItems,
} from "@app/components/vaults/ContentActions";
import { useVaultDataSourceViewContent } from "@app/lib/swr";
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
  parentId: string | null;
  vault: VaultType;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "title",
      id: "title",
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
  vault,
}: VaultDataSourceViewContentListProps) => {
  const [currentTab, setCurrentTab] =
    useState<ContentNodesViewType>("documents");
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const contentActionsRef = useRef<ContentActionsRef>(null);
  const visualTable = {
    file: DocumentTextIcon,
    folder: FolderIcon,
    database: TableIcon,
    channel: ChatBubbleBottomCenterTextIcon,
  };

  // TODO: Do not pass viewType, get all document/tables in one call
  const {
    vaultContent,
    isVaultContentLoading,
    mutateVaultDataSourceViewContent,
  } = useVaultDataSourceViewContent({
    dataSourceView,
    filterPermission: "read",
    owner,
    parentId,
    vaultId: vault.sId,
    viewType: currentTab,
  });

  const rows: RowData[] =
    vaultContent?.map((contentNode) => ({
      ...contentNode,
      icon: visualTable[contentNode.type] ?? DocumentIcon,
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

  if (isVaultContentLoading) {
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
        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              size="sm"
              label="Add data"
              icon={PlusIcon}
              variant="primary"
              type="menu"
            />
          </DropdownMenu.Button>

          <DropdownMenu.Items width={300}>
            <DropdownMenu.Item
              icon={DocumentTextIcon}
              onClick={() => {
                contentActionsRef.current?.callAction(
                  "DocumentUploadOrEditModal"
                );
              }}
              label={"Create a document"}
            />
            <DropdownMenu.Item
              icon={TableIcon}
              onClick={() => {
                contentActionsRef.current?.callAction("TableUploadOrEditModal");
              }}
              label={"Create a table"}
            />
            <DropdownMenu.Item
              icon={CloudArrowUpIcon}
              onClick={() => {
                contentActionsRef.current?.callAction(
                  "MultipleDocumentsUpload"
                );
              }}
              label={"Upload multiple files"}
            />
          </DropdownMenu.Items>
        </DropdownMenu>
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
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  size="sm"
                  label="Type"
                  icon={PlusIcon}
                  variant="secondary"
                  type="menu"
                />
              </DropdownMenu.Button>

              <DropdownMenu.Items>
                <DropdownMenu.Item
                  onClick={() => {
                    setCurrentTab("documents");
                  }}
                  label={"Documents"}
                />
                <DropdownMenu.Item
                  onClick={() => {
                    setCurrentTab("tables");
                  }}
                  label={"Tables"}
                />
              </DropdownMenu.Items>
            </DropdownMenu>
          </>
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn={"title"}
        />
      )}
      <ContentActions
        ref={contentActionsRef}
        dataSourceView={dataSourceView}
        owner={owner}
        plan={plan}
        onSave={mutateVaultDataSourceViewContent}
      />
    </>
  );
};
