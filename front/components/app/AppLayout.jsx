import Head from "next/head";
import Script from "next/script";
import Link from "next/link";
import { Disclosure, Menu } from "@headlessui/react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import { classNames } from "../../lib/utils";
import { ChevronRightIcon, ComputerDesktopIcon } from "@heroicons/react/20/solid";
import { ActionButton, Button } from "../Button";
import { signIn } from "next-auth/react";
import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";

export default function AppLayout({ app, ga_tracking_id, children }) {
  const { data: session } = useSession();

  const router = useRouter();
  let route_user = router.query.user;

  return (
    <main data-color-mode="light">
      <Head>
        {app ? (
          <title>{`Dust - ${route_user} > ${app.name}`}</title>
        ) : (
          <title>{`Dust - ${route_user}`}</title>
        )}
        <link rel="shortcut icon" href="/static/favicon.png" />
        {app ? (
          <>
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:site" content="@dust4ai" />
            <meta
              name="twitter:title"
              content={"[Dust] " + route_user + " > " + app.name}
            />
            <meta
              name="twitter:description"
              content={app.description ? app.description : ""}
            />
            <meta
              name="twitter:image"
              content={`https://dust.tt/api/apps/${route_user}/${app.sId}/card`}
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
                          className="h-5 w-5 shrink text-gray-400 mr-1 pt-0.5"
                          aria-hidden="true"
                        />
                        <Link
                          href={`/${route_user}/apps`}
                          className="text-base font-bold text-gray-800"
                        >
                          {route_user}
                        </Link>
                      </div>
                    </li>

                    {app ? (
                      <li>
                        <div className="flex items-center">
                          <ChevronRightIcon
                            className="h-5 w-5 shrink text-gray-400 mr-1 pt-0.5"
                            aria-hidden="true"
                          />
                          <Link
                            href={`/${route_user}/a/${app.sId}`}
                            className="text-base font-bold w-22 sm:w-auto truncate text-violet-600"
                          >
                            {app.name}
                          </Link>
                        </div>
                      </li>
                    ) : (
                      <></>
                    )}
                  </ol>
                </nav>
                <div className="static inset-auto hidden md:flex flex-initial items-center pr-4">
                  <Link href="https://docs.dust.tt">
                    <Button className="mr-2">
                      <ArrowRightCircleIcon className="-ml-1 mr-2 h-4 w-4" />
                      View Documentation
                    </Button>
                  </Link>
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
                    </Menu>
                  </div>
                ) : (
                  <div className="static inset-auto static inset-auto right-0 hidden sm:flex flex-initial items-center pr-2 sm:pr-0">
                    <div className="-mr-2 sm:mr-0">
                      <ActionButton
                        onClick={() =>
                          signIn("github", { callbackUrl: "/api/login" })
                        }
                      >
                        <ComputerDesktopIcon className="-ml-1 mr-2 h-5 w-5 mt-0.5" />
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
          src={`https://www.googletagmanager.com/gtag/js?id=${ga_tracking_id}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${ga_tracking_id}');
          `}
        </Script>
      </>
    </main>
  );
}
