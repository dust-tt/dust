import { Menu } from "@headlessui/react";
import {
  ArrowUpTrayIcon,
  BeakerIcon,
  ChatBubbleLeftIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
import Link from "next/link";

import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { classNames } from "@app/lib/utils";
import { WorkspaceType } from "@app/types/user";

export default function MainTab({
  currentTab,
  owner,
}: {
  currentTab: string;
  owner: WorkspaceType;
}) {
  const publicTabs: { name: string; href: string; icon: JSX.Element }[] = [
    {
      name: "Chat",
      href: `/w/${owner.sId}/u/chat`,
      icon: (
        <ChatBubbleLeftIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    },
  ];
  const developmentTabs: { name: string; href: string; icon: JSX.Element }[] = [
    {
      name: "Gens",
      href: `/w/${owner.sId}/u/gens`,
      icon: (
        <PencilSquareIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    },
    {
      name: "Extract data",
      href: `/w/${owner.sId}/u/extract`,
      icon: (
        <ArrowUpTrayIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    },
  ];
  // labTabs is a subset of devTabs with experimental features that can be available to users
  const labTabs: { name: string; href: string; icon: JSX.Element }[] = [
    {
      name: "Gens",
      href: `/w/${owner.sId}/u/gens`,
      icon: (
        <div className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
          <BeakerIcon
            className="h-4 w-4 flex-shrink-0 text-green-700"
            aria-hidden="true"
          />
        </div>
      ),
    },
  ];

  const displayDevTabs = isDevelopmentOrDustWorkspace(owner);
  let tabs = publicTabs;
  if (displayDevTabs) {
    tabs = publicTabs.concat(developmentTabs);
  } else if (!owner.disableLabs) {
    tabs = publicTabs.concat(labTabs);
  }
  const currTab = tabs.find((tab) => tab.name == currentTab);

  return (
    <div className="w-full">
      <div className="flex-cols flex border-b border-gray-200 px-2 sm:hidden">
        <div className="flex flex-1">
          <Menu as="div" className="relative w-full">
            <div>
              <Menu.Button className="flex w-full items-center text-sm font-bold text-gray-700 focus:outline-none">
                <div className="flex flex-initial px-4 py-3">
                  {currTab?.icon}
                  {currTab?.name}
                </div>
                <div className="flex">
                  <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                </div>
              </Menu.Button>
            </div>
            <Menu.Items className="absolute left-0 z-10 mt-0 w-full origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              {tabs.map((tab) => (
                <Menu.Item key={tab.name}>
                  {({ active }) => (
                    <Link
                      href={tab.href}
                      key={tab.name}
                      className={classNames(
                        "flex whitespace-nowrap font-medium",
                        active ? "bg-gray-50" : "",
                        "block px-4 py-3 text-sm text-gray-500"
                      )}
                    >
                      {tab.icon}
                      {tab.name}
                    </Link>
                  )}
                </Menu.Item>
              ))}
            </Menu.Items>
          </Menu>
        </div>
        {owner.role === "builder" || owner.role === "admin" ? (
          <div className="flex flex-initial">
            <div
              className={classNames(
                "flex flex items-center whitespace-nowrap border-b-2 px-2 py-3 text-sm",
                "border-gray-500 font-bold text-gray-700"
              )}
            >
              Assistant
            </div>
            <Link
              href={`/w/${owner.sId}/a`}
              className={classNames(
                "flex flex items-center whitespace-nowrap border-b-2 px-2 py-3 text-sm",
                "border-transparent font-medium text-violet-600 hover:border-gray-200 hover:text-violet-700"
              )}
            >
              Admin
            </Link>
          </div>
        ) : null}
      </div>

      <div className="hidden sm:block">
        <div className="border-b border-gray-200 px-4">
          <nav className="-mb-px flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <div key={tab.name} className="flex flex-initial">
                <Link
                  href={tab.href}
                  key={tab.name}
                  className={classNames(
                    "flex flex items-center whitespace-nowrap border-b-2 px-4 py-3 text-sm",
                    tab.name == currentTab
                      ? "border-gray-500 font-bold text-gray-700"
                      : "border-transparent font-medium text-gray-500 hover:border-gray-200 hover:text-gray-700"
                  )}
                >
                  {tab.icon}
                  {tab.name}
                </Link>
              </div>
            ))}
            <div className="flex flex-1"></div>
            {owner.role === "builder" || owner.role === "admin" ? (
              <div className="flex flex-initial">
                <div
                  className={classNames(
                    "flex flex items-center whitespace-nowrap border-b-2 px-2 py-3 text-sm",
                    "border-gray-500 font-bold text-gray-700"
                  )}
                >
                  Assistant
                </div>
                <Link
                  href={`/w/${owner.sId}/a`}
                  className={classNames(
                    "flex flex items-center whitespace-nowrap border-b-2 px-2 py-3 text-sm",
                    "border-transparent font-medium text-violet-600 hover:border-gray-200 hover:text-violet-700"
                  )}
                >
                  Admin
                </Link>
              </div>
            ) : null}
          </nav>
        </div>
      </div>
    </div>
  );
}
