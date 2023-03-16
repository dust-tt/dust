import AppLayout from "../../../components/AppLayout";
import MainTab from "../../../components/profile/MainTab";
import { Button } from "../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { PlusIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { classNames, communityApps } from "../../../lib/utils";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function Home({ apps, readOnly, user, ga_tracking_id }) {
  const { data: session } = useSession();

  return (
    <AppLayout ga_tracking_id={ga_tracking_id}>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab currentTab="Apps" user={user} readOnly={readOnly} />
        </div>
        <div className="">
          <div className="mx-auto sm:max-w-2xl lg:max-w-4xl px-6 divide-y divide-gray-200 mt-8">
            <div>
              {readOnly ? null : (
                <div className="sm:flex sm:items-center">
                  <div className="sm:flex-auto"></div>
                  <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                    <Link href={`/${session.user.username}/apps/new`}>
                      <Button>
                        <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                        New App
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              <div className="overflow-hidden mt-8">
                <ul role="list" className="">
                  {apps.map((app) => (
                    <li key={app.id} className="px-2">
                      <div className="py-4">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/${user}/a/${app.sId}`}
                            className="block"
                          >
                            <p className="truncate text-base font-bold text-violet-600">
                              {app.name}
                            </p>
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
                  {apps.length == 0 ? (
                    <div className="flex flex-col items-center justify-center text-sm text-gray-500 mt-10">
                      {readOnly ? (
                        <>
                          <p>
                            Welcome to Dust 🔥{" "}
                            <span className="font-bold">{user}</span> has not
                            created any apps yet 🙃
                          </p>
                          <p className="mt-2">
                            Sign-in to create your own app.
                          </p>
                        </>
                      ) : (
                        <>
                          <p>Welcome to Dust 🔥</p>
                          <p className="mt-2">
                            Setup your Providers, explore example apps below or
                            create your first app to get started.
                          </p>
                        </>
                      )}
                    </div>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>

          {!readOnly ? (
            <div className="mx-auto sm:max-w-2xl lg:max-w-4xl px-6 divide-y divide-gray-200 space-y-4">
              <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto mt-16">
                  <h1 className="text-base font-medium text-gray-900">
                    Community Example Apps
                  </h1>

                  <p className="text-sm text-gray-500">
                    Discover apps created by the community. They serve as great
                    examples to get started with Dust.
                    <br />
                    You can clone them directly to your account.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden mt-8">
                <ul role="list" className="mb-8">
                  {communityApps.map((app) => (
                    <li key={app.sId} className="px-2">
                      <div className="py-4">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/${app.user}/a/${app.sId}`}
                            className="block"
                          >
                            <p className="truncate text-base font-bold text-violet-600">
                              {app.name}
                            </p>
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
          ) : null}
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

  if (appsRes.status === 404) {
    return {
      notFound: true,
    };
  }

  const [apps] = await Promise.all([appsRes.json()]);

  return {
    props: {
      session,
      apps: apps.apps,
      readOnly,
      user: context.query.user,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
