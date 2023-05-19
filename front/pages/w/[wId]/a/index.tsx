import { PlusIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";

import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/profile/MainTab";
import { getApps } from "@app/lib/api/app";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames, communityApps } from "@app/lib/utils";
import { AppType } from "@app/types/app";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  apps: AppType[];
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const apps = await getApps(auth);

  return {
    props: {
      user,
      owner,
      readOnly,
      apps,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function Apps({
  user,
  owner,
  readOnly,
  apps,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Apps" owner={owner} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
            <div className="mt-8 flex flex-col justify-between lg:flex-row lg:items-center">
              <div className="">
                <h1 className="text-base font-medium text-gray-900">Apps</h1>

                <p className="text-sm text-gray-500">
                  Build custom Large Language Model apps.
                </p>
              </div>
              <div className="mr-2 mt-2 whitespace-nowrap lg:ml-12">
                {!readOnly && (
                  <Link href={`/w/${owner.sId}/a/new`}>
                    <Button>
                      <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                      New App
                    </Button>
                  </Link>
                )}
              </div>
            </div>
            <div className="my-4">
              <ul role="list" className="pt-4">
                {apps.map((app) => (
                  <li key={app.sId} className="px-2">
                    <div className="py-4">
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/w/${owner.sId}/a/${app.sId}`}
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
                  <div className="mt-12 flex flex-col items-center justify-center text-sm text-gray-500">
                    {readOnly ? (
                      <>
                        <p>
                          Welcome to Dust 🔥 This user has not created any app
                          yet 🙃
                        </p>
                        <p className="mt-2">Sign-in to create your own apps.</p>
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

              <div className="mt-8">
                <ul role="list" className="pt-4 mb-8">
                  {communityApps.map((app) => (
                    <li key={app.sId} className="px-2">
                      <div className="py-4">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/w/${app.wId}/a/${app.sId}`}
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
