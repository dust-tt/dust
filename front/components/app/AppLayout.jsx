import { Fragment } from "react";
import Link from "next/link";
import { Disclosure, Menu, Transition } from "@headlessui/react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import { classNames } from "../../lib/utils";

export default function AppLayout({ children }) {
  const { data: session } = useSession();

  const router = useRouter();
  let route_user = router.query.user;

  return (
    <main>
      <Disclosure as="nav" className="bg-white">
        {({ open }) => (
          <>
            <div className="mx-auto px-4">
              <div className="relative flex h-12 items-center justify-between">


                <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
                  <div className="flex flex-shrink-0 items-center px-2 py-1">
                    <div className="flex rotate-[30deg]">
                      <div className="bg-gray-400 w-[4px] h-2 rounded-md"></div>
                      <div className="bg-white w-[1px] h-2"></div>
                      <div className="bg-gray-400 w-[4px] h-3 rounded-md"></div>
                    </div>
                    <div className="bg-white w-[4px] h-2"></div>
                    <div className="text-gray-800 font-black text-base tracking-tight select-none">
                      <Link href={session ? `/${session.user.username}` : `/`}>DUST</Link>
                    </div>
                  </div>
                </div>


                <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
                  <Menu as="div" className="relative ml-3">
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
                      leaveTo="transform opacity-0 scale-95"
                    >
                      <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
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
              </div>
            </div>
          </>
        )}
      </Disclosure>
      <div className="inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-gray-200" />
      </div>
      <div className="mx-auto px-2 mt-4 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}
