import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  DataSourceType,
  ExtensionConfigurationType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceDomain,
  WorkspaceSegmentationType,
  WorkspaceType,
} from "@dust-tt/types";
import { WHITELISTABLE_FEATURES } from "@dust-tt/types";
import { format } from "date-fns/format";
import { keyBy } from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React from "react";

import { AppDataTable } from "@app/components/poke/apps/table";
import { AssistantsDataTable } from "@app/components/poke/assistants/table";
import { DataSourceViewsDataTable } from "@app/components/poke/data_source_views/table";
import { DataSourceDataTable } from "@app/components/poke/data_sources/table";
import { FeatureFlagsDataTable } from "@app/components/poke/features/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { SpaceDataTable } from "@app/components/poke/spaces/table";
import { ActiveSubscriptionTable } from "@app/components/poke/subscriptions/table";
import { TrackerDataTable } from "@app/components/poke/trackers/table";
import { WorkspaceInfoTable } from "@app/components/poke/workspace/table";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import {
  getWorkspaceCreationDate,
  getWorkspaceVerifiedDomain,
} from "@app/lib/api/workspace";
import { useSubmitFunction } from "@app/lib/client/utils";
import { orderDatasourceByImportance } from "@app/lib/connectors";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { Plan, Subscription } from "@app/lib/models/plan";
import { FREE_NO_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { renderSubscriptionFromModels } from "@app/lib/plans/renderers";
import type { ActionRegistry } from "@app/lib/registry";
import { getDustProdActionRegistry } from "@app/lib/registry";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  activeSubscription: SubscriptionType;
  subscriptions: SubscriptionType[];
  dataSources: DataSourceType[];
  whitelistableFeatures: WhitelistableFeature[];
  registry: ActionRegistry;
  workspaceVerifiedDomain: WorkspaceDomain | null;
  worspaceCreationDay: string;
  extensionConfig: ExtensionConfigurationType | null;
  baseUrl: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const activeSubscription = auth.subscription();

  if (!owner || !activeSubscription) {
    return {
      notFound: true,
    };
  }

  const [dataSources, subscriptionModels] = await Promise.all([
    getDataSources(auth, { includeEditedBy: true }),
    Subscription.findAll({
      where: { workspaceId: owner.id },
    }),
  ]);

  const plans = keyBy(
    await Plan.findAll({
      where: {
        id: subscriptionModels.map((s) => s.planId),
      },
    }),
    "id"
  );

  const subscriptions = subscriptionModels.map((s) =>
    renderSubscriptionFromModels({
      plan: plans[s.planId],
      activeSubscription: s,
    })
  );

  const workspaceVerifiedDomain = await getWorkspaceVerifiedDomain(owner);
  const worspaceCreationDate = await getWorkspaceCreationDate(owner.sId);

  const extensionConfig =
    await ExtensionConfigurationResource.fetchForWorkspace(auth);

  return {
    props: {
      owner,
      activeSubscription,
      subscriptions,
      dataSources: orderDatasourceByImportance(
        dataSources.map((ds) => ds.toJSON())
      ),
      whitelistableFeatures:
        WHITELISTABLE_FEATURES as unknown as WhitelistableFeature[],
      registry: getDustProdActionRegistry(),
      workspaceVerifiedDomain,
      worspaceCreationDay: format(worspaceCreationDate, "yyyy-MM-dd"),
      extensionConfig: extensionConfig?.toJSON() ?? null,
      baseUrl: config.getClientFacingUrl(),
    },
  };
});

const WorkspacePage = ({
  owner,
  activeSubscription,
  subscriptions,
  dataSources,
  whitelistableFeatures,
  registry,
  workspaceVerifiedDomain,
  worspaceCreationDay,
  extensionConfig,
  baseUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const { submit: onWorkspaceUpdate } = useSubmitFunction(
    async (segmentation: WorkspaceSegmentationType) => {
      try {
        const r = await fetch(`/api/poke/workspaces/${owner.sId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            segmentation,
          }),
        });
        if (!r.ok) {
          throw new Error("Failed to update workspace.");
        }
        router.reload();
      } catch (e) {
        console.error(e);
        window.alert("An error occurred while updating the workspace.");
      }
    }
  );

  return (
    <>
      <div className="ml-8 p-6">
        <div className="flex justify-between gap-3">
          <div className="flex-grow">
            <span className="text-2xl font-bold">{owner.name}</span>
            <div className="flex gap-4 pt-2">
              <Button
                href={`/poke/${owner.sId}/memberships`}
                label="View members"
                variant="outline"
              />
              <DustAppLogsModal
                owner={owner}
                registry={registry}
                baseUrl={baseUrl}
              />
              <DeleteWorkspaceModal
                owner={owner}
                subscription={activeSubscription}
                dataSources={dataSources}
              />
            </div>
          </div>
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  isSelect
                  label={`Segmentation: ${owner.segmentation ?? "none"}`}
                  variant="outline"
                  size="sm"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {[null, "interesting"].map((segment) => (
                  <DropdownMenuItem
                    label={segment ?? "none"}
                    key={segment ?? "all"}
                    onClick={() => {
                      void onWorkspaceUpdate(
                        segment as WorkspaceSegmentationType
                      );
                    }}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex-col justify-center">
          <div className="flex flex-col space-y-8">
            <div className="mt-4 flex flex-col space-x-3 lg:flex-row">
              <WorkspaceInfoTable
                owner={owner}
                workspaceVerifiedDomain={workspaceVerifiedDomain}
                worspaceCreationDay={worspaceCreationDay}
                extensionConfig={extensionConfig}
              />
              <div className="flex flex-grow flex-col gap-4">
                <PluginList
                  pluginResourceTarget={{
                    resourceId: owner.sId,
                    resourceType: "workspaces",
                    workspace: owner,
                  }}
                />
                <ActiveSubscriptionTable
                  owner={owner}
                  subscription={activeSubscription}
                  subscriptions={subscriptions}
                />
              </div>
            </div>
            <DataSourceDataTable owner={owner} />
            <DataSourceViewsDataTable owner={owner} />
            <SpaceDataTable owner={owner} />
            <AssistantsDataTable owner={owner} />
            <AppDataTable owner={owner} />
            <FeatureFlagsDataTable
              owner={owner}
              whitelistableFeatures={whitelistableFeatures}
            />
            <TrackerDataTable owner={owner} />
          </div>
        </div>
      </div>
    </>
  );
};

export function DustAppLogsModal({
  owner,
  registry,
  baseUrl,
}: {
  owner: WorkspaceType;
  registry: ActionRegistry;
  baseUrl: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="View Dust App Logs" variant="outline" />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>View Dust App Logs</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          {Object.entries(registry).map(
            ([
              action,
              {
                app: { appId, workspaceId: appWorkspaceid, appSpaceId },
              },
            ]) => {
              const url = `${baseUrl}/w/${appWorkspaceid}/spaces/${appSpaceId}/apps/${appId}/runs?wIdTarget=${owner.sId}`;

              return (
                <div key={appId}>
                  <div className="flex flex-row items-center space-x-2">
                    <div className="flex-1">
                      <h3
                        className="cursor-pointer text-lg font-semibold text-action-600"
                        onClick={() => {
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        {action}
                      </h3>
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}

export function DeleteWorkspaceModal({
  owner,
  subscription,
  dataSources,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const sendNotification = useSendNotification();

  const { submit: onDeleteWorkspace } = useSubmitFunction(async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this workspace? Data will be deleted and THERE IS NO GOING BACK."
      )
    ) {
      return;
    }
    setIsLoading(true);
    try {
      const r = await fetch(`/api/poke/workspaces/${owner.sId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!r.ok) {
        const res: { error: { message: string } } = await r.json();
        throw new Error(res.error.message);
      }
      await router.push("/poke?success=workspace-deleted");
      sendNotification({
        title: "Success!",
        description: "Workspace data request successfully sent.",
        type: "success",
      });
    } catch (e) {
      console.error(e);
      window.alert(`We could not delete the workspace:\n${e}`);
    }
    setIsLoading(false);
  });

  const workspaceHasManagedDataSources = dataSources.some(
    (ds) => !!ds.connectorProvider
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button label="Delete the workspace" variant="warning" />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Delete Workspace Data (GDPR)</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-2 pt-4">
            <div className="flex flex-col gap-2 pt-4">
              <div>
                {dataSources.length > 0 && (
                  <p className="mb-4 text-sm text-warning">
                    Delete data sources before deleting the workspace.
                  </p>
                )}
                {subscription.plan.code !== FREE_NO_PLAN_CODE && (
                  <p className="mb-4 text-sm text-warning">
                    Downgrade workspace before deleting its data.
                  </p>
                )}
                {isLoading ? (
                  <p className="mb-4 text-sm text-warning">
                    Deleting workspace data...
                    <Spinner />
                  </p>
                ) : (
                  <Button
                    label="Delete the workspace"
                    variant="outline"
                    onClick={onDeleteWorkspace}
                    disabled={
                      subscription.plan.code !== FREE_NO_PLAN_CODE ||
                      workspaceHasManagedDataSources
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}

WorkspacePage.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name}`}>{page}</PokeLayout>;
};

export default WorkspacePage;
