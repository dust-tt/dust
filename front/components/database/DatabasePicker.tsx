import { WorkspaceType } from "@dust-tt/types";
import { CoreAPIDatabase } from "@dust-tt/types";
import { Menu } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";

import { useDatabases } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

export default function DatabasePicker({
  owner,
  dataSource,
  currentDatabaseId,
  readOnly,
  onDatabaseUpdate,
}: {
  owner: WorkspaceType;
  dataSource: {
    workspace_id: string;
    data_source_id: string;
  };
  currentDatabaseId?: string;
  readOnly: boolean;
  onDatabaseUpdate: (database: CoreAPIDatabase) => void;
}) {
  void owner;
  void dataSource;

  const { databases } = useDatabases({
    workspaceId: dataSource.workspace_id,
    dataSourceName: dataSource.data_source_id,
    offset: 0,
    // TODO(@fontanierh):
    // will break if we have more than 100 databases (but UI wouldn't work anyway)
    limit: 100,
  });

  const currentDatabase = currentDatabaseId
    ? databases.find((db) => db.database_id === currentDatabaseId)
    : null;

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {readOnly ? (
          currentDatabase ? (
            <div className="text-sm font-bold text-action-500">
              {currentDatabase.name}
            </div>
          ) : (
            "No Database"
          )
        ) : (
          <Menu as="div" className="relative inline-block text-left">
            <div>
              <Menu.Button
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-sm font-normal text-gray-700",
                  currentDatabase ? "px-0" : "border px-3",
                  readOnly
                    ? "border-white text-gray-300"
                    : "border-orange-400 text-gray-700",
                  "focus:outline-none focus:ring-0"
                )}
              >
                {currentDatabase ? (
                  <>
                    <div className="mr-1 text-sm font-bold text-action-500">
                      {currentDatabase.name}
                    </div>
                    <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                  </>
                ) : databases && databases.length > 0 ? (
                  "Select Database"
                ) : (
                  "No Databases"
                )}
              </Menu.Button>
            </div>

            {(databases || []).length > 0 ? (
              <Menu.Items
                className={classNames(
                  "absolute z-10 mt-1 w-max origin-top-left rounded-md bg-white shadow-sm ring-1 ring-black ring-opacity-5 focus:outline-none",
                  currentDatabase ? "-left-4" : "left-1"
                )}
              >
                <div className="py-1">
                  {(databases || []).map((db) => {
                    return (
                      <Menu.Item key={db.database_id}>
                        {({ active }) => (
                          <span
                            className={classNames(
                              active
                                ? "bg-gray-50 text-gray-900"
                                : "text-gray-700",
                              "block cursor-pointer px-4 py-2 text-sm"
                            )}
                            onClick={() => onDatabaseUpdate(db)}
                          >
                            {db.name}
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
