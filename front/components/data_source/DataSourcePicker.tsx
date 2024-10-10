import { DropdownMenu, Input } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useVaultDataSourceViews } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";

export default function DataSourcePicker({
  owner,
  vault,
  currentDataSources, // [{ workspace_id, data_source_id }]
  readOnly,
  onDataSourcesUpdate,
}: {
  owner: WorkspaceType;
  vault: VaultType;
  currentDataSources: {
    workspace_id: string;
    data_source_id: string;
  }[];
  readOnly: boolean;
  onDataSourcesUpdate: (
    dataSources: { workspace_id: string; data_source_id: string }[]
  ) => void;
}) {
  const hasDataSourceView =
    currentDataSources.length > 0 &&
    currentDataSources[0].workspace_id &&
    currentDataSources[0].workspace_id.length > 0 &&
    currentDataSources[0].data_source_id &&
    currentDataSources[0].data_source_id.length > 0;

  const {
    vaultDataSourceViews,
    isVaultDataSourceViewsLoading,
    isVaultDataSourceViewsError,
  } = useVaultDataSourceViews({
    vaultId: vault.sId,
    workspaceId: owner.sId,
  });

  const [searchFilter, setSearchFilter] = useState("");
  const [filteredDataSourceViews, setFilteredDataSourceViews] =
    useState(vaultDataSourceViews);

  // Look for the selected data source view in the list - data_source_id can is dsv sId or
  // dataSource name, try to find a match
  const selectedDataSourceView = hasDataSourceView
    ? vaultDataSourceViews.find(
        (dsv) =>
          dsv.sId === currentDataSources[0].data_source_id ||
          // Legacy behavior
          dsv.dataSource.name === currentDataSources[0].data_source_id
      )
    : undefined;

  useEffect(() => {
    if (
      !isVaultDataSourceViewsLoading &&
      !isVaultDataSourceViewsError &&
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
    isVaultDataSourceViewsLoading,
    isVaultDataSourceViewsError,
    vaultDataSourceViews,
  ]);

  const getEditLink = (dsv: DataSourceViewType) => {
    return `/w/${owner.sId}/vaults/${dsv.vaultId}/categories/${dsv.category}/data_source_views/${dsv.sId}`;
  };

  useEffect(() => {
    const newDataSources = searchFilter
      ? vaultDataSourceViews.filter((t) =>
          t.dataSource.name.toLowerCase().includes(searchFilter.toLowerCase())
        )
      : vaultDataSourceViews;
    setFilteredDataSourceViews(newDataSources.slice(0, 30));
  }, [vaultDataSourceViews, searchFilter]);

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {readOnly ? (
          selectedDataSourceView ? (
            <Link href={getEditLink(selectedDataSourceView)}>
              <div className="max-w-20 mr-1 truncate text-sm font-bold text-action-500">
                {selectedDataSourceView.dataSource.name}
              </div>
            </Link>
          ) : (
            "No DataSource"
          )
        ) : (
          <DropdownMenu>
            <div>
              <DropdownMenu.Button
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-sm font-normal text-gray-700",
                  selectedDataSourceView ? "px-0" : "border px-3",
                  readOnly
                    ? "border-white text-gray-300"
                    : "border-orange-400 text-gray-700",
                  "focus:outline-none focus:ring-0"
                )}
              >
                {selectedDataSourceView ? (
                  <>
                    <Link href={getEditLink(selectedDataSourceView)}>
                      <div className="mr-1 max-w-xs truncate text-sm font-bold text-action-500">
                        {selectedDataSourceView.dataSource.name}
                      </div>
                    </Link>
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                  </>
                ) : vaultDataSourceViews && vaultDataSourceViews.length > 0 ? (
                  "Select DataSource"
                ) : (
                  <Link
                    href={`/w/${owner.sId}/data-sources/vaults`}
                    className={classNames(
                      readOnly
                        ? "border-white text-gray-300"
                        : "border-orange-400 text-gray-700"
                    )}
                  >
                    Create DataSource
                  </Link>
                )}
              </DropdownMenu.Button>
            </div>

            {(vaultDataSourceViews || []).length > 0 ? (
              <DropdownMenu.Items width={300}>
                <Input
                  name="search"
                  placeholder="Search"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="mt-4 w-full"
                />
                {(filteredDataSourceViews || []).map((dsv) => {
                  return (
                    <DropdownMenu.Item
                      key={dsv.sId}
                      label={dsv.dataSource.name}
                      onClick={() => {
                        onDataSourcesUpdate([
                          {
                            workspace_id: owner.sId,
                            data_source_id: dsv.sId,
                          },
                        ]);
                        setSearchFilter("");
                      }}
                    />
                  );
                })}
                {filteredDataSourceViews.length === 0 && (
                  <span className="block px-4 py-2 text-sm text-gray-700">
                    No datasources found
                  </span>
                )}
                {/* </div> */}
              </DropdownMenu.Items>
            ) : null}
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
