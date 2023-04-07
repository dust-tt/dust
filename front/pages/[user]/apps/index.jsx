import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/profile/MainTab";
import { Button } from "@app/components/Button";
import { PlusIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { classNames, communityApps } from "@app/lib/utils";
import { auth_user } from "@app/lib/auth";

const { URL, GA_TRACKING_ID = null } = process.env;

export default function Home({
  authUser,
  owner,
  readOnly,
  apps,
  ga_tracking_id,
}) {
  return (
    <AppLayout ga_tracking_id={ga_tracking_id}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Apps" owner={owner} readOnly={readOnly} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
            <div>
              {readOnly ? null : (
                <div className="sm:flex sm:items-center">
                  <div className="sm:flex-auto"></div>
                  <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                    <Link href={`/${owner.username}/apps/new`}>
                      <Button>
                        <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                        New App
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              <div className="mt-8 overflow-hidden">
                <ul role="list" className="">
                  {apps.map((app) => (
                    <li key={app.id} className="px-2">
                      <div className="py-4">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/${owner.username}/a/${app.sId}`}
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
                    <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
                      {readOnly ? (
                        <>
                          <p>
                            Welcome to Dust 🔥{" "}
                            <span className="font-bold">{owner.username}</span>{" "}
                            has not created any apps yet 🙃
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
            <div className="mx-auto space-y-4 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
              <div className="sm:flex sm:items-center">
                <div className="mt-16 sm:flex-auto">
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

              <div className="mt-8 overflow-hidden">
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
  let authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return { noFound: true };
  }
  let auth = authRes.value();

  let readOnly =
    auth.isAnonymous() || context.query.user !== auth.user().username;

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
    return { notFound: true };
  }

  const [apps] = await Promise.all([appsRes.json()]);

  return {
    props: {
      session: auth.session(),
      authUser: auth.isAnonymous() ? null : auth.user(),
      owner: { username: context.query.user },
      readOnly,
      apps: apps.apps,
      ga_tracking_id: GA_TRACKING_ID,
    },
  };
}
