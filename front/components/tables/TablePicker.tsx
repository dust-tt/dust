import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  SearchInput,
  Separator,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewContentNode,
  LightWorkspaceType,
  SpaceType,
} from "@dust-tt/types";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";

import { useDataSourceViewTables } from "@app/lib/swr/data_source_view_tables";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";

interface TablePickerProps {
  owner: LightWorkspaceType;
  dataSource: {
    workspace_id: string;
    data_source_id: string;
  };
  currentTableId?: string;
  readOnly: boolean;
  space: SpaceType;
  onTableUpdate: (table: DataSourceViewContentNode) => void;
  excludeTables?: Array<{ dataSourceId: string; tableId: string }>;
}

export default function TablePicker({
  owner,
  dataSource,
  currentTableId,
  readOnly,
  space,
  onTableUpdate,
  excludeTables,
}: TablePickerProps) {
  void dataSource;

  const { spaceDataSourceViews } = useSpaceDataSourceViews({
    spaceId: space.sId,
    workspaceId: owner.sId,
  });

  // Look for the selected data source view in the list - data_source_id can contain either dsv sId
  // or dataSource name, try to find a match
  const selectedDataSourceView = spaceDataSourceViews.find(
    (dsv) =>
      dsv.sId === dataSource.data_source_id ||
      // Legacy behavior.
      dsv.dataSource.name === dataSource.data_source_id
  );

  const { tables } = useDataSourceViewTables({
    owner,
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
          <PopoverRoot>
            <PopoverTrigger asChild>
              <div
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-sm font-normal",
                  currentTable ? "px-0" : "border px-3",
                  readOnly ? "text-gray-300" : "text-gray-700",
                  "focus:outline-none focus:ring-0"
                )}
              >
                {currentTable ? (
                  <>
                    {/* Use a hand cursor */}
                    <div className="mr-1 cursor-pointer text-sm font-bold text-action-500">
                      {currentTable.title}
                    </div>
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 cursor-pointer hover:text-gray-700" />
                  </>
                ) : tables && tables.length > 0 ? (
                  <span>Select Table</span>
                ) : (
                  <span>No Tables</span>
                )}
              </div>
            </PopoverTrigger>

            {(tables || []).length > 0 && (
              <PopoverContent className="mr-2 p-4">
                <SearchInput
                  name="search"
                  placeholder="Search"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e)}
                />
                <ScrollArea className="flex max-h-[300px] flex-col">
                  {(filteredTables || [])
                    .filter(
                      (t) =>
                        !excludeTables?.some(
                          (et) =>
                            et.dataSourceId === dataSource.data_source_id &&
                            et.tableId === t.dustDocumentId
                        )
                    )
                    .map((t) => (
                      <div
                        key={t.dustDocumentId}
                        className="flex cursor-pointer flex-col items-start hover:opacity-80"
                        onClick={() => {
                          onTableUpdate(t);
                          setSearchFilter("");
                        }}
                      >
                        <div className="my-1">
                          <div className="text-sm">{t.title}</div>
                        </div>
                        <Separator />
                      </div>
                    ))}
                  {filteredTables.length === 0 && (
                    <span className="block px-4 py-2 text-sm text-gray-700">
                      No tables found
                    </span>
                  )}
                </ScrollArea>
              </PopoverContent>
            )}
          </PopoverRoot>
        )}
      </div>
    </div>
  );
}
