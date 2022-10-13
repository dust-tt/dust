import AppLayout from "../../../components/app/AppLayout";
import MainTab from "../../../components/profile/MainTab";
import { Button } from "../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { PlusIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { classNames } from "../../../lib/utils";

const { URL } = process.env;

export default function Home({ apps, readOnly, user }) {
  const { data: session } = useSession();

  return (
    <AppLayout>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab current_tab="Apps" user={user} readOnly={readOnly} />
        </div>
        <div className="">
          <div className="mx-auto sm:max-w-2xl lg:max-w-4xl px-6 divide-y divide-gray-200 mt-8">
            <div>
              {readOnly ? null : (
                <div className="sm:flex sm:items-center">
                  <div className="sm:flex-auto"></div>
                  <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                    <Link href={`/${session.user.username}/apps/new`}>
                      <a>
                        <Button>
                          <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                          New App
                        </Button>
                      </a>
                    </Link>
                  </div>
                </div>
              )}

              <div className="overflow-hidden bg-white mt-8">
                <ul role="list" className="">
                  {apps.map((app) => (
                    <li key={app.id} className="px-2">
                      <div className="py-4">
                        <div className="flex items-center justify-between">
                          <Link href={`/${user}/a/${app.sId}`}>
                            <a className="block">
                              <p className="truncate text-base font-bold text-violet-600">
                                {app.name}
                              </p>
                            </a>
                          </Link>
                          <div className="ml-2 flex flex-shrink-0">
                            <p
                              className={classNames(
                                "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                                app.visibility == "public"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              )}
                            >
                              {app.visibility}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 sm:flex sm:justify-between">
                          <div className="sm:flex">
                            <p className="flex items-center text-sm text-gray-700">
                              {app.description}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center text-sm text-gray-300 sm:mt-0">
                            <p>{app.sId}</p>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  let readOnly = !session || context.query.user !== session.user.username;

  const [appsRes] = await Promise.all([
    fetch(`${URL}/api/apps/${context.query.user}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }),
  ]);

  const [apps] = await Promise.all([appsRes.json()]);

  return {
    props: { session, apps: apps.apps, readOnly, user: context.query.user },
  };
}
