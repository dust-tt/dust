import { useSession } from "next-auth/react";
import { classNames } from "../../lib/utils";
import { Menu } from "@headlessui/react";
import Link from "next/link";
import { CodeBracketIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { LinkIcon, KeyIcon } from "@heroicons/react/24/outline";

export default function MainTab({ current_tab, user, readOnly }) {
  const { data: session } = useSession();

  const tabs = readOnly
    ? [
        {
          name: "Apps",
          href: `/${user}/apps`,
          icon: (
            <CodeBracketIcon
              className="h-4 w-4 flex-shrink-0 mr-2 mt-0.5"
              aria-hidden="true"
            />
          ),
        },
      ]
    : [
        {
          name: "Apps",
          href: `/${session.user.username}/apps`,
          icon: (
            <CodeBracketIcon
              className="h-4 w-4 flex-shrink-0 mr-2 mt-0.5"
              aria-hidden="true"
            />
          ),
        },
        {
          name: "Providers",
          href: `/${session.user.username}/providers`,
          icon: (
            <LinkIcon
              className="h-4 w-4 flex-shrink-0 mr-2 mt-0.5"
              aria-hidden="true"
            />
          ),
        },
        {
          name: "API keys",
          href: `/${session.user.username}/keys`,
          icon: (
            <KeyIcon
              className="h-4 w-4 flex-shrink-0 mr-2 mt-0.5"
              aria-hidden="true"
            />
          ),
        },
      ];

  let currTab = tabs.find((tab) => tab.name == current_tab);

  return (
    <div className="w-full">
      <div className="sm:hidden border-b border-gray-200 px-2">
        <Menu as="div" className="relative">
          <div>
            <Menu.Button className="flex w-full text-sm focus:outline-none text-gray-700 font-bold items-center">
              <div className="flex flex-initial px-4 py-3">
                {currTab.icon}
                {currTab.name}
              </div>
              <div className="flex">
                <ChevronDownIcon className="h-4 w-4 hover:text-gray-700 mt-0.5" />
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
                      "whitespace-nowrap flex font-medium",
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
                  foo={tab.name}
                  className={classNames(
                    "whitespace-nowrap flex py-3 px-4 border-b-2 text-sm flex items-center",
                    tab.name == current_tab
                      ? "border-gray-500 text-gray-700 font-bold"
                      : "font-medium border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
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
