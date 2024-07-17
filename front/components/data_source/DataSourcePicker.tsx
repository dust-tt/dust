import { Input } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { Menu } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useDataSources } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

export default function DataSourcePicker({
  owner,
  currentDataSources, // [{ workspace_id, data_source_id }]
  readOnly,
  onDataSourcesUpdate,
}: {
  owner: WorkspaceType;
  currentDataSources: {
    workspace_id: string;
    data_source_id: string;
  }[];
  readOnly: boolean;
  onDataSourcesUpdate: (
    dataSources: { workspace_id: string; data_source_id: string }[]
  ) => void;
}) {
  const hasDataSource =
    currentDataSources.length > 0 &&
    currentDataSources[0].workspace_id &&
    currentDataSources[0].workspace_id.length > 0 &&
    currentDataSources[0].data_source_id &&
    currentDataSources[0].data_source_id.length > 0;

  const [name, setName] = useState(
    hasDataSource ? currentDataSources[0].data_source_id : null
  );

  const { dataSources, isDataSourcesLoading, isDataSourcesError } =
    useDataSources(owner, { disabled: readOnly });

  const [searchFilter, setSearchFilter] = useState("");
  const [filteredDataSources, setFilteredDataSources] = useState(dataSources);

  useEffect(() => {
    if (!isDataSourcesLoading && !isDataSourcesError && !readOnly) {
      if (!dataSources.find((ds) => ds.name === name)) {
        onDataSourcesUpdate([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, isDataSourcesLoading, isDataSourcesError, dataSources, name]);

  useEffect(() => {
    if (
      currentDataSources.length > 0 &&
      currentDataSources[0].workspace_id &&
      currentDataSources[0].workspace_id.length > 0 &&
      currentDataSources[0].data_source_id &&
      currentDataSources[0].data_source_id.length > 0
    ) {
      setName(currentDataSources[0].data_source_id);
    } else {
      setName(null);
    }
  }, [currentDataSources]);

  useEffect(() => {
    const newDataSources = searchFilter
      ? dataSources.filter((t) =>
          t.name.toLowerCase().includes(searchFilter.toLowerCase())
        )
      : dataSources;
    setFilteredDataSources(newDataSources);
  }, [dataSources, searchFilter]);

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {readOnly ? (
          name ? (
            <Link href={`/${owner.sId}/builder/data-sources/${name}`}>
              <div className="text-sm font-bold text-action-500">{name}</div>
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
                  name && name.length > 0 ? "px-0" : "border px-3",
                  readOnly
                    ? "border-white text-gray-300"
                    : "border-orange-400 text-gray-700",
                  "focus:outline-none focus:ring-0"
                )}
              >
                {name && name.length > 0 ? (
                  <>
                    <Link href={`/w/${owner.sId}/builder/data-sources/${name}`}>
                      <div className="mr-1 text-sm font-bold text-action-500">
                        {name}
                      </div>
                    </Link>
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                  </>
                ) : dataSources && dataSources.length > 0 ? (
                  "Select DataSource"
                ) : (
                  <Link
                    href={`/w/${owner.sId}/builder/data-sources/static`}
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

            {(dataSources || []).length > 0 ? (
              <Menu.Items
                className={classNames(
                  "absolute z-10 mt-1 w-max origin-top-left rounded-md bg-white shadow-sm ring-1 ring-black ring-opacity-5 focus:outline-none",
                  name && name.length > 0 ? "-left-4" : "left-1"
                )}
              >
                <Input
                  name="search"
                  placeholder="Search tables"
                  value={searchFilter}
                  onChange={(value) => setSearchFilter(value)}
                  className="w-48"
                />
                <div className="py-1">
                  {(filteredDataSources || []).map((ds) => {
                    return (
                      <Menu.Item key={ds.name}>
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
                                  data_source_id: ds.name,
                                },
                              ]);
                              setSearchFilter("");
                            }}
                          >
                            {ds.name}
                          </span>
                        )}
                      </Menu.Item>
                    );
                  })}
                  {filteredDataSources.length === 0 && (
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
