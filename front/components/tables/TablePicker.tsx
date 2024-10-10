import { DropdownMenu, Input } from "@dust-tt/sparkle";
import type {
  DataSourceViewContentNode,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";

import { useDataSourceViewTables } from "@app/lib/swr/data_source_views";
import { useVaultDataSourceViews } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";

export default function TablePicker({
  owner,
  dataSource,
  currentTableId,
  readOnly,
  vault,
  onTableUpdate,
}: {
  owner: WorkspaceType;
  dataSource: {
    workspace_id: string;
    data_source_id: string;
  };
  currentTableId?: string;
  readOnly: boolean;
  vault: VaultType;
  onTableUpdate: (table: DataSourceViewContentNode) => void;
}) {
  void owner;
  void dataSource;

  const { vaultDataSourceViews } = useVaultDataSourceViews({
    vaultId: vault.sId,
    workspaceId: owner.sId,
  });

  // Look for the selected data source view in the list - data_source_id can contain either dsv sId
  // or dataSource name, try to find a match
  const selectedDataSourceView = vaultDataSourceViews.find(
    (dsv) =>
      dsv.sId === dataSource.data_source_id ||
      // Legacy behavior
      dsv.dataSource.name === dataSource.data_source_id
  );

  const { tables } = useDataSourceViewTables({
    workspaceId: dataSource.workspace_id,
    dataSourceView: selectedDataSourceView ?? null,
  });

  const currentTable = currentTableId
    ? tables.find((t) => t.dustDocumentId === currentTableId)
    : null;

  const [searchFilter, setSearchFilter] = useState("");
  const [filteredTables, setFilteredTables] = useState(tables);

  useEffect(() => {
    const newTables = searchFilter
      ? tables.filter((t) =>
          t.title.toLowerCase().includes(searchFilter.toLowerCase())
        )
      : tables;
    setFilteredTables(newTables.slice(0, 30));
  }, [tables, searchFilter]);

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {readOnly ? (
          currentTable ? (
            <div className="text-sm font-bold text-action-500">
              {currentTable.title}
            </div>
          ) : (
            "No Table"
          )
        ) : (
          <DropdownMenu>
            <div>
              <DropdownMenu.Button
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-sm font-normal text-gray-700",
                  currentTable ? "px-0" : "border px-3",
                  readOnly
                    ? "border-white text-gray-300"
                    : "border-orange-400 text-gray-700",
                  "focus:outline-none focus:ring-0"
                )}
              >
                {currentTable ? (
                  <>
                    <div className="mr-1 text-sm font-bold text-action-500">
                      {currentTable.title}
                    </div>
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                  </>
                ) : tables && tables.length > 0 ? (
                  "Select Table"
                ) : (
                  "No Tables"
                )}
              </DropdownMenu.Button>
            </div>

            {(tables || []).length > 0 ? (
              <DropdownMenu.Items width={300}>
                <Input
                  name="search"
                  placeholder="Search"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="mt-4 w-full"
                />
                {(filteredTables || []).map((t) => {
                  return (
                    <DropdownMenu.Item
                      key={t.dustDocumentId}
                      label={t.title}
                      onClick={() => {
                        onTableUpdate(t);
                        setSearchFilter("");
                      }}
                    />
                  );
                })}
                {filteredTables.length === 0 && (
                  <span className="block px-4 py-2 text-sm text-gray-700">
                    No tables found
                  </span>
                )}
              </DropdownMenu.Items>
            ) : null}
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
