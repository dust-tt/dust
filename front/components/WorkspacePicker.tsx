import { Menu } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

import { classNames } from "@app/lib/utils";
import { UserType, WorkspaceType } from "@app/types/user";

export default function WorkspacePicker({
  user,
  workspace,
  readOnly,
  onWorkspaceUpdate,
}: {
  user: UserType;
  workspace: WorkspaceType | null;
  readOnly: boolean;
  onWorkspaceUpdate: (w: WorkspaceType) => void;
}) {
  return (
    <div className="flex items-center">
      <Menu as="div" className="relative inline-block text-left">
        <div>
          <Menu.Button
            className={classNames(
              "inline-flex items-center rounded-md py-1 text-sm font-normal",
              workspace ? "px-0" : "border px-3",
              readOnly
                ? "border-white text-gray-300"
                : "border-orange-400 text-gray-700",
              "focus:outline-none focus:ring-0"
            )}
          >
            {workspace ? (
              <>
                <div className="text-base font-bold text-gray-800">
                  <Link href={`/w/${workspace.sId}`}>{workspace.name}</Link>
                </div>
                <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
              </>
            ) : (
              "Select workspace"
            )}
          </Menu.Button>
        </div>

        <Menu.Items
          className={classNames(
            "absolute left-1 z-10 mt-1 origin-top-left rounded-md bg-white shadow ring-1 ring-black ring-opacity-5 focus:outline-none",
            workspace ? "-left-8" : "left-1"
          )}
        >
          <div className="py-1">
            {user.workspaces.map((w) => {
              return (
                <Menu.Item key={w.sId}>
                  {({ active }) => (
                    <span
                      className={classNames(
                        active ? "bg-gray-50 text-gray-900" : "text-gray-700",
                        "block cursor-pointer whitespace-nowrap px-4 py-2 text-sm"
                      )}
                      onClick={() => onWorkspaceUpdate(w)}
                    >
                      {w.name}
                    </span>
                  )}
                </Menu.Item>
              );
            })}
          </div>
        </Menu.Items>
      </Menu>
    </div>
  );
}
