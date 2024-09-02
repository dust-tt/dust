import { Button, PlusIcon, Tab, TrashIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { DatasetType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useContext } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import {
  subNavigationApp,
  subNavigationBuild,
} from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { getApp } from "@app/lib/api/app";
import config from "@app/lib/api/config";
import { getDatasets } from "@app/lib/api/datasets";
import { withDefaultUserAuthRequirementsNoWorkspaceCheck } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";
import { getDustAppsListUrl } from "@app/lib/vault_rollout";

export const getServerSideProps =
  withDefaultUserAuthRequirementsNoWorkspaceCheck<{
    owner: WorkspaceType;
    subscription: SubscriptionType;
    readOnly: boolean;
    app: AppType;
    datasets: DatasetType[];
    dustAppsListUrl: string;
    gaTrackingId: string;
  }>(async (context, auth) => {
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
    const dustAppsListUrl = await getDustAppsListUrl(auth);

    return {
      props: {
        owner,
        subscription,
        readOnly,
        app,
        datasets,
        dustAppsListUrl,
        gaTrackingId: config.getGaTrackingId(),
      },
    };
  });

export default function DatasetsView({
  owner,
  subscription,
  readOnly,
  app,
  datasets,
  dustAppsListUrl,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const confirm = useContext(ConfirmContext);

  const handleDelete = async (datasetName: string) => {
    if (
      await confirm({
        title: "Double checking",
        message: "Are you sure you want to delete this dataset entirely?",
        validateVariant: "primaryWarning",
      })
    ) {
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
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "developers",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl);
          }}
        />
      }
      hideSidebar
    >
      <div className="flex w-full flex-col">
        <Tab
          className="mt-2"
          tabs={subNavigationApp({ owner, app, current: "datasets" })}
        />
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
