import {
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  ScrollBar,
  SearchInput,
} from "@dust-tt/sparkle";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import React, { useEffect, useState } from "react";

import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { useCursorPagination } from "@app/hooks/useCursorPagination";
import {
  useDataSourceViewTable,
  useDataSourceViewTables,
} from "@app/lib/swr/data_source_view_tables";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";
import type {
  CoreAPITable,
  DataSourceViewContentNode,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

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

const PAGE_SIZE = 25;

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
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [allTablesMap, setallTablesMap] = useState<
    Map<string, DataSourceViewContentNode>
  >(new Map());
  const [currentTable, setCurrentTable] = useState<CoreAPITable>();
  const {
    cursorPagination,
    reset: resetPagination,
    handleLoadNext,
    pageIndex,
  } = useCursorPagination(PAGE_SIZE);

  const { spaceDataSourceViews } = useSpaceDataSourceViews({
    spaceId: space.sId,
    workspaceId: owner.sId,
  });

  const selectedDataSourceView = spaceDataSourceViews.find(
    (dsv) =>
      dsv.sId === dataSource.data_source_id ||
      dsv.dataSource.name === dataSource.data_source_id
  );

  const { tables, nextPageCursor, isTablesLoading } = useDataSourceViewTables({
    owner,
    dataSourceView: selectedDataSourceView ?? null,
    searchQuery: debouncedSearch,
    pagination: cursorPagination,
    disabled: !debouncedSearch,
  });

  const { table, isTableLoading, isTableError } = useDataSourceViewTable({
    owner: owner,
    dataSourceView: selectedDataSourceView ?? null,
    tableId: currentTableId ?? null,
    disabled: !currentTableId,
  });

  useEffect(() => {
    if (tables && !isTablesLoading) {
      setallTablesMap((prevTablesMap) => {
        if (pageIndex === 0) {
          return new Map(tables.map((table) => [table.internalId, table]));
        } else {
          // Create a new Map to avoid mutating the previous state
          const newTablesMap = new Map(prevTablesMap);

          tables.forEach((table) => {
            newTablesMap.set(table.internalId, table);
          });

          return newTablesMap;
        }
      });
    }
  }, [tables, isTablesLoading, pageIndex]);

  useEffect(() => {
    if (!isTableLoading && !isTableError) {
      setCurrentTable(table);
    }
  }, [isTableError, isTableLoading, table]);

  const [searchFilter, setSearchFilter] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const newSearchTerm =
        searchFilter.length >= MIN_SEARCH_QUERY_SIZE ? searchFilter : "";
      if (newSearchTerm !== debouncedSearch) {
        resetPagination();
        setDebouncedSearch(newSearchTerm);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchFilter, debouncedSearch, resetPagination]);

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {readOnly ? (
          currentTable ? (
            <div className="max-w-20 mr-1 truncate text-sm font-bold text-action-500">
              {currentTable.title}
            </div>
          ) : (
            "No Table"
          )
        ) : (
          <PopoverRoot open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              {currentTable ? (
                <div
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 text-sm font-normal",
                    readOnly ? "text-gray-300" : "text-gray-700",
                    "focus:outline-none focus:ring-0"
                  )}
                >
                  <div className="mr-1 max-w-xs truncate text-sm font-bold text-action-500">
                    {currentTable.title}
                  </div>
                  <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                </div>
              ) : allTablesMap.size > 0 ? (
                <Button
                  variant="outline"
                  label="Select Table"
                  isSelect
                  size="xs"
                />
              ) : (
                <span
                  className={classNames(
                    "text-sm",
                    readOnly ? "text-gray-300" : "text-gray-700"
                  )}
                >
                  No Tables
                </span>
              )}
            </PopoverTrigger>

            <PopoverContent className="mr-2">
              <SearchInput
                name="search"
                placeholder="Search for tables"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e)}
              />
              <ScrollArea hideScrollBar className="flex max-h-[300px] flex-col">
                <div className="w-full space-y-1">
                  {Array.from(allTablesMap.values())
                    .filter(
                      (t) =>
                        !excludeTables?.some(
                          (et) =>
                            et.dataSourceId === dataSource.data_source_id &&
                            et.tableId === t.internalId
                        )
                    )
                    .map((t) => (
                      <div
                        key={t.internalId}
                        className="flex cursor-pointer flex-col items-start px-1 hover:opacity-80"
                        onClick={() => {
                          onTableUpdate(t);
                          setSearchFilter("");
                          setOpen(false);
                        }}
                      >
                        <div className="my-1">
                          <div className="text-sm">{t.title}</div>
                        </div>
                      </div>
                    ))}
                  {allTablesMap.size === 0 && (
                    <span className="block px-4 pt-2 text-sm text-gray-700">
                      No tables found
                    </span>
                  )}
                </div>
                <InfiniteScroll
                  nextPage={() => {
                    handleLoadNext(nextPageCursor);
                  }}
                  hasMore={!!nextPageCursor}
                  isValidating={isTablesLoading}
                  isLoading={isTablesLoading}
                >
                  {isTablesLoading && !allTablesMap.size && (
                    <div className="py-2 text-center text-sm text-element-700">
                      Loading tables...
                    </div>
                  )}
                </InfiniteScroll>
                {/*sentinel div to trigger the infinite scroll*/}
                <div className="min-h-0.5 text-xs text-gray-400"></div>
                <ScrollBar className="py-0" />
              </ScrollArea>
            </PopoverContent>
          </PopoverRoot>
        )}
      </div>
    </div>
  );
}
