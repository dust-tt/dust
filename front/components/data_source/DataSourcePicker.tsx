import { Input } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { Menu } from "@headlessui/react";
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

  const selectedDataSourceView = hasDataSourceView
    ? vaultDataSourceViews.find(
        (dsv) =>
          dsv.sId === currentDataSources[0].data_source_id ||
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
        onDataSourcesUpdate([]);
      } else if (
        selectedDataSourceView.sId !== currentDataSources[0].data_source_id
      ) {
        // Update config with data_source_view id instead of data_source name
        onDataSourcesUpdate([
          {
            workspace_id: owner.sId,
            data_source_id: selectedDataSourceView.sId,
          },
        ]);
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
    return owner.flags.includes("data_vaults_feature")
      ? `/w/${owner.sId}/data-sources/vaults/${dsv.vaultId}/categories/${dsv.category}/data_source_views/${dsv.sId}`
      : `/w/${owner.sId}/builder/data-sources/${dsv.dataSource.name}`;
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
              <div className="text-sm font-bold text-action-500">
                {selectedDataSourceView.dataSource.name}
              </div>
            </Link>
          ) : (
            "No DataSource"
          )
        ) : (
          <Menu as="div" className="relative inline-block text-left">
            <div>
              <Menu.Button
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
                      <div className="mr-1 text-sm font-bold text-action-500">
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
              </Menu.Button>
            </div>

            {(vaultDataSourceViews || []).length > 0 ? (
              <Menu.Items
                className={classNames(
                  "absolute z-10 mt-1 w-max origin-top-left rounded-md bg-white shadow-sm ring-1 ring-black ring-opacity-5 focus:outline-none",
                  selectedDataSourceView ? "-left-4" : "left-1"
                )}
              >
                <Input
                  name="search"
                  placeholder="Search"
                  value={searchFilter}
                  onChange={(value) => setSearchFilter(value)}
                  className="w-48"
                />
                <div className="py-1">
                  {(filteredDataSourceViews || []).map((dsv) => {
                    return (
                      <Menu.Item key={dsv.sId}>
                        {({ active }) => (
                          <span
                            className={classNames(
                              active
                                ? "bg-gray-50 text-gray-900"
                                : "text-gray-700",
                              "block cursor-pointer px-4 py-2 text-sm"
                            )}
                            onClick={() => {
                              onDataSourcesUpdate([
                                {
                                  workspace_id: owner.sId,
                                  data_source_id: dsv.sId,
                                },
                              ]);
                              setSearchFilter("");
                            }}
                          >
                            {dsv.dataSource.name}
                          </span>
                        )}
                      </Menu.Item>
                    );
                  })}
                  {filteredDataSourceViews.length === 0 && (
                    <span className="block px-4 py-2 text-sm text-gray-700">
                      No datasources found
                    </span>
                  )}
                </div>
              </Menu.Items>
            ) : null}
          </Menu>
        )}
      </div>
    </div>
  );
}
