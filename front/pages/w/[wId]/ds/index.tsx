import { PlusIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";

import AppLayout from "@app/components/AppLayout";
import { Button } from "@app/components/Button";
import MainTab from "@app/components/profile/MainTab";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  dataSources: DataSourceType[];
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

  let dataSources = await getDataSources(auth);

  return {
    props: {
      user,
      owner,
      readOnly,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourcesView({
  user,
  owner,
  readOnly,
  dataSources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="DataSources" owner={owner} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
            <div>
              {readOnly ? null : (
                <div className="sm:flex sm:items-center">
                  <div className="sm:flex-auto"></div>
                  <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
                    <Link
                      href={`/w/${owner.sId}/ds/new`}
                      onClick={(e) => {
                        // Enforce plan limits: DataSources count.
                        if (
                          owner.plan.limits.dataSources.count != -1 &&
                          dataSources.length >=
                            owner.plan.limits.dataSources.count
                        ) {
                          e.preventDefault();
                          window.alert(
                            "You are limited to 1 DataSource on our free plan. Contact team@dust.tt if you want to increase this limit."
                          );
                          return;
                        }
                      }}
                    >
                      <Button>
                        <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                        New DataSource
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              <div className="mt-8 overflow-hidden">
                <ul role="list" className="">
                  {dataSources.map((ds) => (
                    <li key={ds.name} className="px-2">
                      <div className="py-4">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/w/${owner.sId}/ds/${ds.name}`}
                            className="block"
                          >
                            <p className="truncate text-base font-bold text-violet-600">
                              {ds.name}
                            </p>
                          </Link>
                          <div className="ml-2 flex flex-shrink-0">
                            <p
                              className={classNames(
                                "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                                ds.visibility == "public"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              )}
                            >
                              {ds.visibility}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 sm:flex sm:justify-between">
                          <div className="sm:flex">
                            <p className="flex items-center text-sm text-gray-700">
                              {ds.description}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center text-sm text-gray-300 sm:mt-0">
                            <p></p>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                  {dataSources.length == 0 ? (
                    <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
                      {readOnly ? (
                        <>
                          <p>
                            Welcome to Dust DataSources 🔎 This user has not
                            created any data source yet 🙃
                          </p>
                          <p className="mt-2">
                            Sign-in to create your own data sources.
                          </p>
                        </>
                      ) : (
                        <>
                          <p>Welcome to Dust DataSources 🔎</p>
                          <p className="mt-2">
                            Data sources let you upload documents to perform
                            semantic searches on them (
                            <span className="rounded-md bg-gray-200 px-1 py-0.5 font-bold">
                              data_source
                            </span>{" "}
                            block).
                          </p>
                        </>
                      )}
                    </div>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
