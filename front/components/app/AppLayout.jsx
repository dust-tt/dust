import { Fragment } from "react";
import Head from "next/head";
import Link from "next/link";
import { Disclosure, Menu, Transition } from "@headlessui/react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import { classNames } from "../../lib/utils";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { Button } from "../Button";
import { signIn } from "next-auth/react";

export default function AppLayout({ app, children }) {
  const { data: session } = useSession();

  const router = useRouter();
  let route_user = router.query.user;

  return (
    <main>
      <Head>
        <title>Dust - Design and Deploy Large Language Models Apps</title>
        <link rel="shortcut icon" href="/static/favicon.png" />
      </Head>
      <Disclosure as="nav" className="bg-white">
        {({ open }) => (
          <>
            <div className="mx-auto px-4">
              <div className="relative flex h-12 items-center">
                <div className="flex flex-initial items-center justify-center sm:items-stretch sm:justify-start">
                  <div className="flex flex-shrink-0 items-center pl-2 py-1">
                    <div className="flex rotate-[30deg]">
                      <div className="bg-gray-400 w-[4px] h-2 rounded-md"></div>
                      <div className="bg-white w-[1px] h-2"></div>
                      <div className="bg-gray-400 w-[4px] h-3 rounded-md"></div>
                    </div>
                    <div className="bg-white w-[4px] h-2"></div>
                    <div className="text-gray-800 font-bold text-base tracking-tight select-none">
                      <Link
                        href={session ? `/${session.user.username}/apps` : `/`}
                      >
                        DUST
                      </Link>
                    </div>
                  </div>
                </div>
                <nav className="flex flex-1 ml-1 h-12">
                  <ol role="list" className="flex items-center space-x-2">
                    <li>
                      <div className="flex items-center">
                        <ChevronRightIcon
                          className="h-5 w-5 flex-shrink-0 text-gray-400 mr-1 pt-0.5"
                          aria-hidden="true"
                        />
                        <Link href={`/${route_user}/apps`}>
                          <a
                            href="#"
                            className="text-base font-bold text-gray-800"
                          >
                            {route_user}
                          </a>
                        </Link>
                      </div>
                    </li>

                    {app ? (
                      <li>
                        <div className="flex items-center">
                          <ChevronRightIcon
                            className="h-5 w-5 flex-shrink-0 text-gray-400 mr-1 pt-0.5"
                            aria-hidden="true"
                          />
                          <Link href={`/${route_user}/a/${app.sId}`}>
                            <a
                              href="#"
                              className="text-base font-bold w-22 sm:w-auto truncate text-violet-600"
                            >
                              {app.name}
                            </a>
                          </Link>
                        </div>
                      </li>
                    ) : (
                      <></>
                    )}
                  </ol>
                </nav>
                <div className="static inset-auto hidden sm:flex flex-initial items-center pr-4">
                  <Menu as="div" className="relative ml-3">
                    <div>
                      <Menu.Button
                        className={classNames(
                          "hover:bg-gray-50 text-gray-700",
                          "flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium leading-4",
                          "shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2"
                        )}
                      >
                        <span className="sr-only">Open help menu</span>
                        Help
                      </Menu.Button>
                    </div>
                    <Transition
                      as={Fragment}
                      enter="transition ease-out duration-100"
                      enterFrom="transform opacity-0 scale-95"
                      enterTo="transform opacity-100 scale-100"
                      leave="transition ease-in duration-75"
                      leaveFrom="transform opacity-100 scale-100"
                      leaveTo="transform opacitydivide-0 scale-95"
                    >
                      <Menu.Items className="absolute right-0 z-10 mt-2 w-24 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        <Menu.Item>
                          {({ active }) => (
                            <a
                              href="/readme"
                              target="_blank"
                              className={classNames(
                                active ? "bg-gray-50" : "",
                                "block px-4 py-2 text-sm text-gray-700"
                              )}
                            >
                              README
                            </a>
                          )}
                        </Menu.Item>
                        <Menu.Item>
                          {({ active }) => (
                            <a
                              href="https://discord.gg/8NJR3zQU5X"
                              target="_blank"
                              className={classNames(
                                active ? "bg-gray-50" : "",
                                "block px-4 py-2 text-sm text-gray-700"
                              )}
                            >
                              Discord
                            </a>
                          )}
                        </Menu.Item>
                      </Menu.Items>
                    </Transition>
                  </Menu>
                </div>
                {session ? (
                  <div className="static inset-auto right-0 flex flex-initial items-center pr-2">
                    <Menu as="div" className="relative">
                      <div>
                        <Menu.Button className="flex rounded-full bg-gray-800 text-sm focus:outline-nonek">
                          <span className="sr-only">Open user menu</span>
                          <img
                            className="h-8 w-8 rounded-full"
                            src={session.user.image}
                            alt=""
                          />
                        </Menu.Button>
                      </div>
                      <Transition
                        as={Fragment}
                        enter="transition ease-out duration-100"
                        enterFrom="transform opacity-0 scale-95"
                        enterTo="transform opacity-100 scale-100"
                        leave="transition ease-in duration-75"
                        leaveFrom="transform opacity-100 scale-100"
                        leaveTo="transform opacitydivide-0 scale-95"
                      >
                        <Menu.Items className="absolute right-0 z-10 mt-2 w-24 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          <Menu.Item>
                            {({ active }) => (
                              <a
                                href="#"
                                onClick={() => signOut()}
                                className={classNames(
                                  active ? "bg-gray-50" : "",
                                  "block px-4 py-2 text-sm text-gray-700"
                                )}
                              >
                                Sign out
                              </a>
                            )}
                          </Menu.Item>
                        </Menu.Items>
                      </Transition>
                    </Menu>
                  </div>
                ) : (
                  <div className="static inset-auto static inset-auto right-0 hidden sm:flex flex-initial items-center pr-2 sm:pr-0">
                    <div className="-mr-2 sm:mr-0">
                      <Button
                        onClick={() =>
                          signIn("github", { callbackUrl: "/api/login" })
                        }
                      >
                        Sign in with Github
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Disclosure>
      <div className="mt-0">{children}</div>
    </main>
  );
}
