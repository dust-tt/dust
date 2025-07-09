import {
  Button,
  Hoverable,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  SearchInput,
} from "@dust-tt/sparkle";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";
import type { DataSourceViewType, SpaceType, WorkspaceType } from "@app/types";

export default function DataSourcePicker({
  owner,
  space,
  currentDataSources, // [{ workspace_id, data_source_id }]
  readOnly,
  onDataSourcesUpdate,
  linksDisabled,
}: {
  owner: WorkspaceType;
  space: SpaceType;
  currentDataSources: {
    workspace_id: string;
    data_source_id: string;
  }[];
  readOnly: boolean;
  onDataSourcesUpdate: (
    dataSources: { workspace_id: string; data_source_id: string }[]
  ) => void;
  linksDisabled?: boolean;
}) {
  const hasDataSourceView =
    currentDataSources.length > 0 &&
    currentDataSources[0].workspace_id &&
    currentDataSources[0].workspace_id.length > 0 &&
    currentDataSources[0].data_source_id &&
    currentDataSources[0].data_source_id.length > 0;

  const {
    spaceDataSourceViews,
    isSpaceDataSourceViewsLoading,
    isSpaceDataSourceViewsError,
  } = useSpaceDataSourceViews({
    spaceId: space.sId,
    workspaceId: owner.sId,
  });

  const [searchFilter, setSearchFilter] = useState("");
  const [filteredDataSourceViews, setFilteredDataSourceViews] =
    useState(spaceDataSourceViews);

  // Look for the selected data source view in the list - data_source_id can is dsv sId or
  // dataSource name, try to find a match
  const selectedDataSourceView = hasDataSourceView
    ? spaceDataSourceViews.find(
        (dsv) =>
          dsv.sId === currentDataSources[0].data_source_id ||
          // Legacy behavior
          dsv.dataSource.name === currentDataSources[0].data_source_id
      )
    : undefined;

  useEffect(() => {
    if (
      !isSpaceDataSourceViewsLoading &&
      !isSpaceDataSourceViewsError &&
      !readOnly &&
      hasDataSourceView
    ) {
      if (!selectedDataSourceView) {
        // If the selected data source view is not found in the list, reset the config
        onDataSourcesUpdate([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasDataSourceView,
    selectedDataSourceView,
    readOnly,
    isSpaceDataSourceViewsLoading,
    isSpaceDataSourceViewsError,
    spaceDataSourceViews,
  ]);

  const getEditLink = (dsv: DataSourceViewType) => {
    return `/w/${owner.sId}/spaces/${dsv.spaceId}/categories/${dsv.category}/data_source_views/${dsv.sId}`;
  };

  const MaybeLink = ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => {
    if (linksDisabled) {
      return <div>{children}</div>;
    }
    return (
      <Hoverable variant="highlight" className="copy-sm" href={href}>
        {children}
      </Hoverable>
    );
  };

  useEffect(() => {
    const newDataSources = searchFilter
      ? spaceDataSourceViews.filter((t) =>
          t.dataSource.name.toLowerCase().includes(searchFilter.toLowerCase())
        )
      : spaceDataSourceViews;
    setFilteredDataSourceViews(newDataSources.slice(0, 30));
  }, [spaceDataSourceViews, searchFilter]);

  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {readOnly ? (
          selectedDataSourceView ? (
            <MaybeLink href={getEditLink(selectedDataSourceView)}>
              <div className="max-w-20 mr-1 truncate">
                {selectedDataSourceView.dataSource.name}
              </div>
            </MaybeLink>
          ) : (
            "No DataSource"
          )
        ) : (
          <PopoverRoot open={open} onOpenChange={setOpen}>
            <PopoverTrigger>
              {selectedDataSourceView ? (
                <div
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 text-sm font-normal",
                    readOnly
                      ? "text-gray-400 dark:text-gray-400-night"
                      : "text-muted-foreground dark:text-muted-foreground-night",
                    "focus:outline-none focus:ring-0"
                  )}
                >
                  <MaybeLink href={getEditLink(selectedDataSourceView)}>
                    <div className="mr-1 max-w-xs truncate">
                      {selectedDataSourceView.dataSource.name}
                    </div>
                  </MaybeLink>
                  <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-muted-foreground dark:text-muted-foreground-night" />
                </div>
              ) : spaceDataSourceViews && spaceDataSourceViews.length > 0 ? (
                <Button
                  variant="outline"
                  label="Select DataSource"
                  isSelect
                  size="xs"
                />
              ) : (
                <Link
                  href={`/w/${owner.sId}/spaces/${space.sId}`}
                  className={classNames(
                    readOnly
                      ? "text-gray-400 dark:text-gray-400-night"
                      : "text-muted-foreground dark:text-muted-foreground-night"
                  )}
                >
                  Create DataSource
                </Link>
              )}
            </PopoverTrigger>

            {(spaceDataSourceViews || []).length > 0 && (
              <PopoverContent className="mr-2 p-4">
                <SearchInput
                  name="search"
                  placeholder="Search"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e)}
                />
                <ScrollArea className="flex max-h-[300px] flex-col">
                  {(filteredDataSourceViews || []).map((dsv) => (
                    <div
                      key={dsv.sId}
                      className="flex cursor-pointer flex-col items-start hover:opacity-80"
                      onClick={() => {
                        onDataSourcesUpdate([
                          {
                            workspace_id: owner.sId,
                            data_source_id: dsv.sId,
                          },
                        ]);
                        setSearchFilter("");
                        setOpen(false);
                      }}
                    >
                      <div className="my-1">
                        <div className="text-sm">{dsv.dataSource.name}</div>
                      </div>
                    </div>
                  ))}
                  {filteredDataSourceViews.length === 0 && (
                    <span className="block px-4 py-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                      No datasources found
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
