import { classNames } from "@app/lib/utils";
import Link from "next/link";
import { Menu } from "@headlessui/react";
import {
  DocumentIcon,
  Cog6ToothIcon,
  DocumentMagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { ChevronDownIcon } from "@heroicons/react/20/solid";

export default function MainTab({ dataSource, currentTab, owner, readOnly }) {
  let tabs = [
    {
      name: "Documents",
      href: `/${owner.username}/ds/${dataSource.name}`,
      icon: (
        <DocumentIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    },
    {
      name: "Search",
      href: `/${owner.username}/ds/${dataSource.name}/search`,
      icon: (
        <DocumentMagnifyingGlassIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    },
  ];

  if (!readOnly) {
    tabs.push({
      name: "Settings",
      href: `/${owner.username}/ds/${dataSource.name}/settings`,
      icon: (
        <Cog6ToothIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    });
  }

  let currTab = tabs.find((tab) => tab.name == currentTab);

  return (
    <div className="w-full">
      <div className="border-b border-gray-200 px-2 sm:hidden">
        <Menu as="div" className="relative">
          <div>
            <Menu.Button className="flex w-full items-center text-sm font-bold text-gray-700 focus:outline-none">
              <div className="flex flex-initial px-4 py-3">
                {currTab.icon}
                {currTab.name}
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

      <div className="hidden sm:block">
        <div className="border-b border-gray-200 px-4">
          <nav className="-mb-px flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <div key={tab.name} className="flex flex-initial">
                <Link
                  href={tab.href}
                  key={tab.name}
                  className={classNames(
                    "flex items-center whitespace-nowrap border-b-2 py-3 px-4 text-sm",
                    tab.name === currentTab
                      ? "border-gray-500 font-bold text-gray-700"
                      : "border-transparent font-medium text-gray-500 hover:border-gray-200 hover:text-gray-700"
                  )}
                  aria-current={tab.current ? "page" : undefined}
                >
                  {tab.icon}
                  {tab.name}
                </Link>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
