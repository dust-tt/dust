import { Disclosure, Menu } from "@headlessui/react";
import {
  ChevronRightIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/20/solid";
import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Script from "next/script";
import { signIn, signOut } from "next-auth/react";

import { classNames } from "@app/lib/utils";
import { AppType } from "@app/types/app";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

import { ActionButton, Button } from "./Button";
import WorkspacePicker from "./WorkspacePicker";

export default function AppLayout({
  user,
  owner,
  app,
  dataSource,
  gaTrackingId,
  children,
}: {
  user: UserType | null;
  owner: WorkspaceType;
  app?: AppType;
  dataSource?: DataSourceType;
  gaTrackingId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <main data-color-mode="light">
      <Head>
        {app ? (
          <title>{`Dust - ${owner.name} > ${app.name}`}</title>
        ) : dataSource ? (
          <title>{`Dust - ${owner.name} > ${dataSource.name}`}</title>
        ) : (
          <title>{`Dust - ${owner.name}`}</title>
        )}
        <link rel="shortcut icon" href="/static/favicon.png" />
        {app ? (
          <>
            <meta name="twitter:card" content="summary" />
            <meta name="twitter:site" content="@dust4ai" />
            <meta
              name="twitter:title"
              content={"[Dust] " + owner.name + " > " + app.name}
            />
            <meta
              name="twitter:description"
              content={app.description ? app.description : ""}
            />
          </>
        ) : null}
      </Head>
      <Disclosure as="nav" className="bg-white">
        {({ open }) => (
          <>
            <div className="mx-auto px-4">
              <div className="relative flex h-12 items-center">
                <div className="flex flex-initial items-center justify-center sm:items-stretch sm:justify-start">
                  <div className="flex flex-shrink-0 items-center py-1 pl-2">
                    <div className="flex rotate-[30deg]">
                      <div className="h-2 w-[4px] rounded-md bg-gray-400"></div>
                      <div className="h-2 w-[1px] bg-white"></div>
                      <div className="h-3 w-[4px] rounded-md bg-gray-400"></div>
                    </div>
                    <div className="h-2 w-[4px] bg-white"></div>
                    <div className="select-none text-base font-bold tracking-tight text-gray-800">
                      <Link href="/">DUST</Link>
                    </div>
                  </div>
                </div>
                <nav className="ml-1 flex h-12 flex-1">
                  <ol role="list" className="flex items-center space-x-1">
                    <li>
                      <div className="flex items-center">
                        <ChevronRightIcon
                          className="mr-1 h-5 w-5 shrink pt-0.5 text-gray-400"
                          aria-hidden="true"
                        />
                        {user && user.workspaces.length > 1 ? (
                          <WorkspacePicker
                            user={user}
                            workspace={owner}
                            readOnly={false}
                            onWorkspaceUpdate={(workspace) => {
                              if (workspace.id === owner.id) {
                                if (dataSource) {
                                  router
                                    .push(`/w/${workspace.sId}/ds`)
                                    .catch(console.error);
                                } else if (app) {
                                  router
                                    .push(`/w/${workspace.sId}/a`)
                                    .catch(console.error);
                                } else {
                                  router
                                    .push(`/w/${workspace.sId}`)
                                    .catch(console.error);
                                }
                              } else {
                                router
                                  .push(`/w/${workspace.sId}`)
                                  .catch(console.error);
                              }
                            }}
                          />
                        ) : (
                          <Link
                            href={
                              dataSource
                                ? `/w/${owner.sId}/ds`
                                : app
                                ? `/w/${owner.sId}/a`
                                : `/w/${owner.sId}`
                            }
                            className="text-base font-bold text-gray-800"
                          >
                            {owner.name}
                          </Link>
                        )}
                      </div>
                    </li>

                    {app ? (
                      <li>
                        <div className="flex items-center">
                          <ChevronRightIcon
                            className="mr-1 h-5 w-5 shrink pt-0.5 text-gray-400"
                            aria-hidden="true"
                          />
                          <Link
                            href={`/w/${owner.sId}/a/${app.sId}`}
                            className="w-22 truncate text-base font-bold text-violet-600 sm:w-auto"
                          >
                            {app.name}
                          </Link>
                        </div>
                      </li>
                    ) : null}
                    {dataSource ? (
                      <li>
                        <div className="flex items-center">
                          <ChevronRightIcon
                            className="mr-1 h-5 w-5 shrink pt-0.5 text-gray-400"
                            aria-hidden="true"
                          />
                          <Link
                            href={`/w/${owner.sId}/ds/${dataSource.name}`}
                            className="w-22 truncate text-base font-bold text-violet-600 sm:w-auto"
                          >
                            {dataSource.name}
                          </Link>
                        </div>
                      </li>
                    ) : null}
                  </ol>
                </nav>
                <div className="static inset-auto hidden flex-initial items-center pr-4 md:flex">
                  <Link href="https://docs.dust.tt">
                    <Button>
                      <>
                        <ArrowRightCircleIcon className="-ml-1 mr-2 h-4 w-4" />
                        View Documentation
                      </>
                    </Button>
                  </Link>
                </div>
                {user ? (
                  <div className="static inset-auto right-0 flex flex-initial items-center pr-2">
                    <Menu as="div" className="relative">
                      <div>
                        <Menu.Button className="focus:outline-nonek flex rounded-full bg-gray-800 text-sm">
                          <span className="sr-only">Open user menu</span>
                          <img
                            className="h-8 w-8 rounded-full"
                            src={
                              user.image
                                ? user.image
                                : "https://gravatar.com/avatar/anonymous"
                            }
                            alt=""
                          />
                        </Menu.Button>
                      </div>
                      <Menu.Items className="absolute right-0 z-10 mt-2 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        <Menu.Item>
                          {({ active }) => (
                            <a
                              href="https://docs.dust.tt"
                              className={classNames(
                                active ? "bg-gray-50" : "",
                                "block px-4 py-2 text-sm text-gray-700"
                              )}
                            >
                              Documentation
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
                        <Menu.Item>
                          {({ active }) => (
                            <a
                              href="https://github.com/dust-tt/dust"
                              target="_blank"
                              className={classNames(
                                active ? "bg-gray-50" : "",
                                "block px-4 py-2 text-sm text-gray-700"
                              )}
                            >
                              GitHub
                            </a>
                          )}
                        </Menu.Item>
                        <Menu.Item>
                          {({ active }) => (
                            <a
                              href="#"
                              onClick={() =>
                                signOut({
                                  callbackUrl: "/",
                                  redirect: true,
                                })
                              }
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
                    </Menu>
                  </div>
                ) : (
                  <div className="static static inset-auto inset-auto right-0 hidden flex-initial items-center pr-2 sm:flex sm:pr-0">
                    <div className="-mr-2 sm:mr-0">
                      <ActionButton
                        onClick={() =>
                          signIn("github", { callbackUrl: "/api/login" })
                        }
                      >
                        <ComputerDesktopIcon className="-ml-1 mr-2 mt-0.5 h-5 w-5" />
                        Sign in with Github
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Disclosure>
      <div className="mt-0">{children}</div>
      <>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${gaTrackingId}');
          `}
        </Script>
      </>
    </main>
  );
}
