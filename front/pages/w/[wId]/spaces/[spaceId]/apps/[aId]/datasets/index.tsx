import {
  Button,
  Chip,
  PlusIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useContext } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { subNavigationApp } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { getDatasets } from "@app/lib/api/datasets";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { AppResource } from "@app/lib/resources/app_resource";
import { dustAppsListUrl } from "@app/lib/spaces";
import { classNames } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";
import type { AppType } from "@app/types";
import type { DatasetType } from "@app/types";
import type { SubscriptionType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  app: AppType;
  datasets: DatasetType[];
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const app = await AppResource.fetchById(auth, context.params?.aId as string);
  if (!app) {
    return {
      notFound: true,
    };
  }

  const datasets = await getDatasets(auth, app.toJSON());

  return {
    props: {
      owner,
      subscription,
      readOnly,
      app: app.toJSON(),
      datasets,
    },
  };
});

export default function DatasetsView({
  owner,
  subscription,
  readOnly,
  app,
  datasets,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const confirm = useContext(ConfirmContext);

  const handleDelete = async (datasetName: string) => {
    if (
      await confirm({
        title: "Double checking",
        message: "Are you sure you want to delete this dataset entirely?",
        validateVariant: "warning",
      })
    ) {
      await fetch(
        `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/${datasetName}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      await router.push(
        `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`
      );
    }
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title={app.name}
          onClose={() => {
            void router.push(dustAppsListUrl(owner, app.space));
          }}
        />
      }
    >
      <div className="flex w-full flex-col">
        <Tabs value="datasets" className="mt-2">
          <TabsList>
            {subNavigationApp({ owner, app, current: "datasets" }).map(
              (tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  label={tab.label}
                  icon={tab.icon}
                  onClick={() => {
                    if (tab.href) {
                      void router.push(tab.href);
                    }
                  }}
                />
              )
            )}
          </TabsList>
        </Tabs>
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
                      `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/new`
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
                        href={`/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/${d.name}`}
                        className="block"
                      >
                        <div
                          key={d.name}
                          className="group rounded border border-gray-300 px-4 py-4 dark:border-gray-300-night"
                        >
                          <div className="flex items-center justify-between">
                            <p className="heading-base truncate text-highlight-500">
                              {d.name}
                            </p>
                            {readOnly ? null : (
                              <div className="ml-2 flex flex-shrink-0">
                                <TrashIcon
                                  className="hidden h-4 w-4 text-gray-400 hover:text-warning group-hover:block dark:text-gray-400-night"
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
                                    ? "text-gray-700 dark:text-gray-700-night"
                                    : "text-gray-300 dark:text-gray-300-night",
                                  "text-s flex items-center"
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
                  <div className="py-2 text-sm text-gray-400 dark:text-gray-400-night">
                    Datasets are used as input data to apps (
                    <Chip label="input" color="slate" /> block) or few-shot
                    examples to prompt models (
                    <Chip label="data" color="slate" /> block).
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
