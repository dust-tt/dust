import { Button, PlusIcon, Tab, TrashIcon } from "@dust-tt/sparkle";
import { UserType, WorkspaceType } from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import {
  subNavigationAdmin,
  subNavigationApp,
} from "@app/components/sparkle/navigation";
import { getApp } from "@app/lib/api/app";
import { getDatasets } from "@app/lib/api/datasets";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";
import { AppType } from "@app/types/app";
import { DatasetType } from "@app/types/dataset";
import { SubscriptionType } from "@app/types/plan";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
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
  const subscription = auth.subscription();
  if (!owner || !subscription) {
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
      subscription,
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
  subscription,
  readOnly,
  app,
  datasets,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const handleDelete = async (datasetName: string) => {
    if (confirm("Are you sure you want to delete this dataset entirely?")) {
      await fetch(
        `/api/w/${owner.sId}/apps/${app.sId}/datasets/${datasetName}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      await router.push(`/w/${owner.sId}/a/${app.sId}/datasets`);
    }
  };

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({
        owner,
        current: "developers",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(`/w/${owner.sId}/a`);
          }}
        />
      }
      hideSidebar
    >
      <div className="flex w-full flex-col">
        <div className="mt-2 overflow-x-auto scrollbar-hide">
          <Tab tabs={subNavigationApp({ owner, app, current: "datasets" })} />
        </div>
        <div className="mt-8 flex flex-col">
          <div className="flex flex-1">
            <div className="mb-4 flex flex-auto flex-col gap-y-4">
              <div className="flex flex-row items-center justify-between">
                <Button
                  disabled={readOnly}
                  variant="primary"
                  label="New Dataset"
                  icon={PlusIcon}
                  onClick={() => {
                    void router.push(
                      `/w/${owner.sId}/a/${app.sId}/datasets/new`
                    );
                  }}
                />
              </div>
              <div className="mt-2">
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
                            <p className="truncate text-base font-bold text-action-500">
                              {d.name}
                            </p>
                            {readOnly ? null : (
                              <div className="ml-2 flex flex-shrink-0">
                                <TrashIcon
                                  className="hidden h-4 w-4 text-gray-400 hover:text-red-600 group-hover:block"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    await handleDelete(d.name);
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
