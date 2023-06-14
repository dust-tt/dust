import { Menu } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useDataSources } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { WorkspaceType } from "@app/types/user";

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

  const { dataSources, isDataSourcesLoading, isDataSourcesError } = readOnly
    ? {
        dataSources: [],
        isDataSourcesLoading: false,
        isDataSourcesError: false,
      }
    : useDataSources(owner);

  useEffect(() => {
    console.log("useEffect", dataSources, name);
    if (!isDataSourcesLoading && !isDataSourcesError && !readOnly) {
      if (!dataSources.find((ds) => ds.name === name)) {
        onDataSourcesUpdate([]);
      }
    }
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

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {readOnly ? (
          name ? (
            <Link href={`/${owner.sId}/ds/${name}`}>
              <div className="text-sm font-bold text-violet-600">{name}</div>
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
                    <Link href={`/w/${owner.sId}/ds/${name}`}>
                      <div className="mr-1 text-sm font-bold text-violet-600">
                        {name}
                      </div>
                    </Link>
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                  </>
                ) : dataSources && dataSources.length > 0 ? (
                  "Select DataSource"
                ) : (
                  <Link
                    href={`/w/${owner.sId}/ds`}
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
                <div className="py-1">
                  {(dataSources || []).map((ds) => {
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
                            onClick={() =>
                              onDataSourcesUpdate([
                                {
                                  workspace_id: owner.sId,
                                  data_source_id: ds.name,
                                },
                              ])
                            }
                          >
                            {ds.name}
                          </span>
                        )}
                      </Menu.Item>
                    );
                  })}
                </div>
              </Menu.Items>
            ) : null}
          </Menu>
        )}
      </div>
    </div>
  );
}
