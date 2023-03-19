import { Menu } from "@headlessui/react";
import { classNames } from "@app/lib/utils";
import { useEffect } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { getDataSources, lookUpDataSource } from "@app/lib/data_source";
import { useState } from "react";
import { Button } from "@app/components/Button";
import TextareaAutosize from "react-textarea-autosize";
import { useDataSources } from "@app/lib/swr";

export default function DataSourcePicker({
  currentUser,
  dataSource, // { project_id, data_source_id }
  readOnly,
  onDataSourceUpdate,
}) {
  let [user, setUser] = useState(currentUser);
  let [name, setName] = useState(null);
  let [userEditing, setUserEditing] = useState(false);
  let [isLoading, setIsLoading] = useState(true);

  let { dataSources, isDataSourcesLoading, isDataSourcesError } = readOnly
    ? {
        dataSources: [],
        isDataSourcesLoading: false,
        isDataSourcesError: false,
      }
    : useDataSources(user);

  useEffect(() => {
    if (
      dataSource.project_id &&
      dataSource.project_id.length > 0 &&
      dataSource.data_source_id &&
      dataSource.data_source_id.length > 0
    ) {
      (async () => {
        // retrieve user for project_id
        let ds = await lookUpDataSource(
          dataSource.project_id,
          dataSource.data_source_id
        );
        setIsLoading(false);
        if (ds) {
          setUser(ds.user.username);
          setName(ds.dataSource.name);
        } else {
          setName(null);
        }
      })();
    } else {
      setIsLoading(false);
    }
  }, [dataSource]);

  useEffect(() => {
    if (!readOnly && user && user.length > 0) {
      setName(null);
    }
  }, [user]);

  return (
    <div className="flex items-center">
      <div className="flex">
        {userEditing ? (
          <input
            type="text"
            className={classNames(
              "block flex-1 rounded-md px-1 font-bold text-sm py-1 w-32",
              readOnly
                ? "border-white ring-0 focus:ring-0 focus:border-white"
                : "border-white focus:border-gray-300 focus:ring-0"
            )}
            autoFocus={true}
            spellCheck={false}
            readOnly={readOnly}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" || e.key == "Enter") {
                if (e.target.value.length > 0) {
                  setUserEditing(false);
                } else {
                  setUser(currentUser);
                  setUserEditing(false);
                }
              }
            }}
            onBlur={() => {
              if (user.length > 0) {
                setUserEditing(false);
              } else {
                setUser(currentUser);
                setUserEditing(false);
              }
            }}
          />
        ) : (
          <div
            className="block font-bold text-sm"
            onClick={() => {
              setUserEditing(true);
            }}
          >
            {user}
          </div>
        )}
      </div>

      <div className="flex ml-1">
        <ChevronRightIcon
          className="h-5 w-5 shrink text-gray-400 mr-1 pt-0.5"
          aria-hidden="true"
        />
      </div>

      <div className="flex items-center">
        {readOnly || isLoading ? (
          <Link href={`/${user}/ds/${name}`}>
            <div className="font-bold text-violet-600 text-sm">{name}</div>
          </Link>
        ) : (
          <Menu as="div" className="relative inline-block text-left">
            <div>
              <Menu.Button
                className={classNames(
                  "inline-flex items-center rounded-md py-1 text-gray-700 text-sm font-normal",
                  name && name.length > 0 ? "px-0" : "border px-3",
                  readOnly
                    ? "text-gray-300 border-white"
                    : "text-gray-700 border-orange-400",
                  "focus:outline-none focus:ring-0"
                )}
                readOnly={readOnly}
              >
                {name && name.length > 0 ? (
                  <>
                    <Link href={`/${user}/ds/${name}`}>
                      <div className="font-bold text-violet-600 text-sm mr-1">
                        {name}
                      </div>
                    </Link>
                    <ChevronDownIcon className="h-4 w-4 hover:text-gray-700 mt-0.5" />
                  </>
                ) : dataSources && dataSources.length > 0 ? (
                  "Select DataSource"
                ) : currentUser === user ? (
                  <Link
                    href={`/${user}/data_sources`}
                    className={classNames(
                      readOnly
                        ? "text-gray-300 border-white"
                        : "text-gray-700 border-orange-400"
                    )}
                  >
                    Create DataSource
                  </Link>
                ) : (
                  "No DataSource"
                )}
              </Menu.Button>
            </div>

            {(dataSources || []).length > 0 ? (
              <Menu.Items
                className={classNames(
                  "absolute w-max shadow z-10 mt-1 origin-top-left rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none",
                  name && name.length > 0 ? "-left-4" : "left-1"
                )}
              >
                <div className="py-1">
                  {(dataSources || []).map((ds) => {
                    return (
                      <Menu.Item
                        key={ds.id}
                        onClick={() =>
                          onDataSourceUpdate({
                            project_id: ds.dustAPIProjectId,
                            data_source_id: ds.name,
                          })
                        }
                      >
                        {({ active }) => (
                          <span
                            className={classNames(
                              active
                                ? "bg-gray-50 text-gray-900"
                                : "text-gray-700",
                              "block px-4 py-2 text-sm cursor-pointer"
                            )}
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
