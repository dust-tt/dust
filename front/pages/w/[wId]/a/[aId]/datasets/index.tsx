import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import Router from "next/router";

import MainTab from "@app/components/app/MainTab";
import AppLayout from "@app/components/AppLayout";
import { ActionButton } from "@app/components/Button";
import { getApp } from "@app/lib/api/app";
import { getDatasets } from "@app/lib/api/datasets";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { AppType } from "@app/types/app";
import { DatasetType } from "@app/types/dataset";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
  app: AppType;
  datasets: DatasetType[];
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

  const app = await getApp(auth, context.params?.aId as string);

  if (!app) {
    return {
      notFound: true,
    };
  }

  const datasets = await getDatasets(auth, app);

  return {
    props: {
      user,
      owner,
      readOnly,
      app,
      datasets,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DatasetsView({
  user,
  owner,
  readOnly,
  app,
  datasets,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const handleDelete = async (datasetName: string) => {
    if (confirm("Are you sure you want to delete this dataset entirely?")) {
      const res = await fetch(
        `/api/w/${owner.sId}/apps/${app.sId}/datasets/${datasetName}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      Router.push(`/w/${owner.sId}/a/${app.sId}/datasets`);
    }
  };

  return (
    <AppLayout user={user} owner={owner} app={app} gaTrackingId={gaTrackingId}>
      <div className="leadingflex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab app={app} currentTab="Datasets" owner={owner} />
        </div>
        <div className="mx-auto mt-4 w-full max-w-5xl">
          <div className="flex flex-1">
            <div className="mx-2 my-4 flex flex-auto flex-col sm:mx-4 lg:mx-8">
              <Link href={`/w/${owner.sId}/a/${app.sId}/datasets/new`}>
                <ActionButton disabled={readOnly}>
                  <PlusIcon className="-ml-1 mr-1 mt-0.5 h-5 w-5" />
                  New Dataset
                </ActionButton>
              </Link>

              <div className="mt-4">
                <ul role="list" className="flex-1 space-y-4">
                  {datasets.map((d) => {
                    return (
                      <Link
                        key={d.name}
                        href={`/w/${owner.sId}/a/${app.sId}/datasets/${d.name}`}
                        className="block"
                      >
                        <div
                          key={d.name}
                          className="group rounded border border-gray-300 px-4 py-4"
                        >
                          <div className="flex items-center justify-between">
                            <p className="truncate text-base font-bold text-violet-600">
                              {d.name}
                            </p>
                            {readOnly ? null : (
                              <div className="ml-2 flex flex-shrink-0">
                                <TrashIcon
                                  className="hidden h-4 w-4 text-gray-400 hover:text-red-700 group-hover:block"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleDelete(d.name);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <div className="mt-2 sm:flex sm:justify-between">
                            <div className="sm:flex">
                              <p
                                className={classNames(
                                  d.description
                                    ? "text-gray-700"
                                    : "text-gray-300",
                                  "flex items-center text-sm text-gray-700"
                                )}
                              >
                                {d.description
                                  ? d.description
                                  : "No description"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </ul>
                <div className="mt-2 max-w-4xl px-2">
                  <div className="py-2 text-sm text-gray-400">
                    Datasets are used as input data to apps (
                    <span className="rounded-md bg-gray-200 px-1 py-0.5 font-bold">
                      input
                    </span>{" "}
                    block) or few-shot examples to prompt models (
                    <span className="rounded-md bg-gray-200 px-1 py-0.5 font-bold">
                      data
                    </span>{" "}
                    block).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
