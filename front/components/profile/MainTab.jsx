import { useSession, signOut } from "next-auth/react";
import { classNames } from "../../lib/utils";
import Link from "next/link";
import { CodeBracketIcon } from "@heroicons/react/24/solid";
import { LinkIcon } from "@heroicons/react/24/outline";

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
      ];

  return (
    <div className="w-full">
      <div className="block">
        <div className="border-b border-gray-200 px-4">
          <nav className="-mb-px flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <div key={tab.name} className="flex flex-initial">
                <Link href={tab.href} key={tab.name}>
                  <a
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
                  </a>
                </Link>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
