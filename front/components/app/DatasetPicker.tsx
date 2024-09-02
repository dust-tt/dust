import { ChevronDownIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import { Menu } from "@headlessui/react";
import Link from "next/link";

import { useDatasets } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

export default function DatasetPicker({
  owner,
  dataset,
  app,
  readOnly,
  onDatasetUpdate,
}: {
  owner: WorkspaceType;
  dataset: string;
  app: AppType;
  readOnly: boolean;
  onDatasetUpdate: (dataset: string) => void;
}) {
  const { datasets, isDatasetsLoading, isDatasetsError } = useDatasets({
    owner,
    app,
    disabled: readOnly,
  });

  // Remove the dataset if it was suppressed.
  if (
    !readOnly &&
    !isDatasetsLoading &&
    !isDatasetsError &&
    dataset &&
    datasets.filter((d) => d.name === dataset).length == 0
  ) {
    setTimeout(() => {
      onDatasetUpdate("");
    });
  }

  return (
    <div className="flex items-center rounded-md px-2">
      <Menu as="div" className="relative inline-block text-left">
        <div>
          {datasets.length == 0 && !dataset && !readOnly ? (
            <Link
              href={`/w/${owner.sId}/a/${app.sId}/datasets/new`}
              className={classNames(
                "inline-flex items-center rounded-md py-1 text-sm font-normal",
                dataset ? "px-1" : "border px-3",
                readOnly
                  ? "border-white text-gray-300"
                  : "border-orange-400 text-gray-700",
                "focus:outline-none focus:ring-0"
              )}
            >
              {isDatasetsLoading ? "Loading..." : "Create dataset"}
            </Link>
          ) : (
            <Menu.Button
              className={classNames(
                "inline-flex items-center rounded-md px-3 py-1 text-sm font-normal",
                dataset ? "border px-1" : "border border-orange-400",
                readOnly ? "border-white text-gray-300" : "text-gray-700",
                "focus:outline-none focus:ring-0"
              )}
              disabled={readOnly}
            >
              {dataset ? (
                <>
                  <div className="text-sm font-bold text-action-500">
                    {dataset}
                  </div>
                  &nbsp;
                  {readOnly ? null : (
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                  )}
                </>
              ) : (
                "Select dataset"
              )}
            </Menu.Button>
          )}
        </div>

        {readOnly ? null : (
          <Menu.Items
            className={classNames(
              "absolute left-1 z-10 mt-1 origin-top-left rounded-md bg-white shadow-sm ring-1 ring-black ring-opacity-5 focus:outline-none",
              dataset ? "-left-8" : "left-1"
            )}
          >
            <div className="py-1">
              {datasets.map((d) => {
                return (
                  <Menu.Item key={d.name}>
                    {({ active }) => (
                      <span
                        className={classNames(
                          active ? "bg-gray-50 text-gray-900" : "text-gray-700",
                          "block cursor-pointer whitespace-nowrap px-4 py-2 text-sm"
                        )}
                        onClick={() => onDatasetUpdate(d.name)}
                      >
                        {d.name}
                      </span>
                    )}
                  </Menu.Item>
                );
              })}
              <Menu.Item key="__create_dataset">
                {({ active }) => (
                  <Link href={`/w/${owner.sId}/a/${app.sId}/datasets/new`}>
                    <div
                      className={classNames(
                        active ? "bg-gray-50 text-gray-500" : "text-gray-400",
                        "block cursor-pointer whitespace-nowrap px-4 py-2 text-sm font-normal"
                      )}
                    >
                      Create new dataset
                    </div>
                  </Link>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        )}
      </Menu>
    </div>
  );
}
