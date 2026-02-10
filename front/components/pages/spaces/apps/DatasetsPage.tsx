import { Button, Chip, PlusIcon, Spinner, TrashIcon } from "@dust-tt/sparkle";
import { useContext } from "react";

import { DustAppPageLayout } from "@app/components/apps/DustAppPageLayout";
import { ConfirmContext } from "@app/components/Confirm";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import {
  LinkWrapper,
  useAppRouter,
  useRequiredPathParam,
} from "@app/lib/platform";
import { useApp } from "@app/lib/swr/apps";
import { useDatasets } from "@app/lib/swr/datasets";
import { classNames } from "@app/lib/utils";
import Custom404 from "@app/pages/404";

export function DatasetsPage() {
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const aId = useRequiredPathParam("aId");
  const owner = useWorkspace();
  const { isBuilder } = useAuth();

  const { app, isAppLoading, isAppError } = useApp({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
  });

  const { datasets, isDatasetsLoading } = useDatasets({
    owner,
    app,
  });

  const confirm = useContext(ConfirmContext);
  const readOnly = !isBuilder;

  const handleDelete = async (datasetName: string) => {
    if (!app) {
      return;
    }

    if (
      await confirm({
        title: "Double checking",
        message: "Are you sure you want to delete this dataset entirely?",
        validateVariant: "warning",
      })
    ) {
      await clientFetch(
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

  const isLoading = isAppLoading || isDatasetsLoading;

  // Show 404 on error or if app not found after loading completes
  if (isAppError || (!isLoading && !app)) {
    return <Custom404 />;
  }

  if (isLoading || !app) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <DustAppPageLayout app={app} currentTab="datasets">
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
                    <LinkWrapper
                      key={d.name}
                      href={`/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/${d.name}`}
                      className="block"
                    >
                      <div className="group rounded border border-gray-300 px-4 py-4 dark:border-gray-300-night">
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
                              {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                              {d.description ? d.description : "No description"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </LinkWrapper>
                  );
                })}
              </ul>
              <div className="mt-2 px-2">
                <div className="py-2 text-sm text-gray-400 dark:text-gray-400-night">
                  Datasets are used as input data to apps (
                  <Chip label="input" /> block) or few-shot examples to prompt
                  models (
                  <Chip label="data" /> block).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DustAppPageLayout>
  );
}
