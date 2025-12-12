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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { format } from "date-fns/format";
import keyBy from "lodash/keyBy";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type Stripe from "stripe";

import { AppDataTable } from "@app/components/poke/apps/table";
import { AssistantsDataTable } from "@app/components/poke/assistants/table";
import { CreditsDataTable } from "@app/components/poke/credits/table";
import { DataSourceViewsDataTable } from "@app/components/poke/data_source_views/table";
import { DataSourceDataTable } from "@app/components/poke/data_sources/table";
import { FeatureFlagsDataTable } from "@app/components/poke/features/table";
import { GroupDataTable } from "@app/components/poke/groups/table";
import { MCPServerViewsDataTable } from "@app/components/poke/mcp_server_views/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import {
  PokeAlert,
  PokeAlertDescription,
  PokeAlertTitle,
} from "@app/components/poke/shadcn/ui/alert";
import { SpaceDataTable } from "@app/components/poke/spaces/table";
import {
  ActiveSubscriptionTable,
  PlanLimitationsTable,
} from "@app/components/poke/subscriptions/table";
import { TriggerDataTable } from "@app/components/poke/triggers/table";
import { WorkspaceInfoTable } from "@app/components/poke/workspace/table";
import config from "@app/lib/api/config";
import { getWorkspaceCreationDate } from "@app/lib/api/workspace";
import { getWorkspaceVerifiedDomains } from "@app/lib/api/workspace_domains";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { renderSubscriptionFromModels } from "@app/lib/plans/renderers";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import type { ActionRegistry } from "@app/lib/registry";
import { getDustProdActionRegistry } from "@app/lib/registry";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { usePokeDataRetention } from "@app/poke/swr/data_retention";
import type {
  ExtensionConfigurationType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceDomain,
  WorkspaceSegmentationType,
  WorkspaceType,
} from "@app/types";
import { isString, WHITELISTABLE_FEATURES } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  activeSubscription: SubscriptionType;
  baseUrl: string;
  extensionConfig: ExtensionConfigurationType | null;
  owner: WorkspaceType;
  registry: ActionRegistry;
  stripeSubscription: Stripe.Subscription | null;
  subscriptions: SubscriptionType[];
  whitelistableFeatures: WhitelistableFeature[];
  workspaceVerifiedDomains: WorkspaceDomain[];
  workspaceCreationDay: string;
  workosEnvironmentId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const activeSubscription = auth.subscription();

  if (!owner || !activeSubscription) {
    return {
      notFound: true,
    };
  }

  const subscriptionModels = await SubscriptionModel.findAll({
    where: { workspaceId: owner.id },
  });

  const plans = keyBy(
    await PlanModel.findAll({
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

  const workspaceVerifiedDomains = await getWorkspaceVerifiedDomains(owner);
  const workspaceCreationDay = await getWorkspaceCreationDate(owner.sId);

  const extensionConfig =
    await ExtensionConfigurationResource.fetchForWorkspace(auth);

  let stripeSubscription: Stripe.Subscription | null = null;
  if (activeSubscription.stripeSubscriptionId) {
    stripeSubscription = await getStripeSubscription(
      activeSubscription.stripeSubscriptionId
    );
  }

  return {
    props: {
      owner,
      activeSubscription,
      stripeSubscription,
      subscriptions,
      whitelistableFeatures: WHITELISTABLE_FEATURES,
      registry: getDustProdActionRegistry(),
      workspaceVerifiedDomains,
      workspaceCreationDay: format(workspaceCreationDay, "yyyy-MM-dd"),
      extensionConfig: extensionConfig?.toJSON() ?? null,
      baseUrl: config.getClientFacingUrl(),
      workosEnvironmentId: config.getWorkOSEnvironmentId(),
    },
  };
});

const WorkspacePage = ({
  owner,
  activeSubscription,
  stripeSubscription,
  subscriptions,
  whitelistableFeatures,
  registry,
  workspaceVerifiedDomains,
  workspaceCreationDay,
  extensionConfig,
  baseUrl,
  workosEnvironmentId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const currentTab = !isString(router.query.tab)
    ? "datasources"
    : router.query.tab;

  const handleTabChange = (value: string) => {
    void router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, tab: value },
      },
      undefined,
      { shallow: true }
    );
  };

  const { submit: onWorkspaceUpdate } = useSubmitFunction(
    async (segmentation: WorkspaceSegmentationType) => {
      try {
        const r = await clientFetch(`/api/poke/workspaces/${owner.sId}`, {
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

  const { data: dataRetention } = usePokeDataRetention({
    owner,
    disabled: false,
  });

  const workspaceRetention = dataRetention?.workspace ?? null;
  const agentsRetention = dataRetention?.agents ?? {};
  const isInMaintenance = owner.metadata?.maintenance;

  return (
    <div className="ml-8 p-6">
      {isInMaintenance && (
        <PokeAlert variant="destructive" className="mb-6">
          <PokeAlertTitle>Workspace in Maintenance Mode</PokeAlertTitle>
          <PokeAlertDescription>
            This workspace is currently in maintenance mode and should not be
            modified, unless you know what you are doing.
          </PokeAlertDescription>
        </PokeAlert>
      )}
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
          <div className="mt-4 flex flex-row items-stretch gap-3">
            <Tabs defaultValue="workspace" className="min-w-[512px]">
              <TabsList className="mb-3">
                <TabsTrigger value="workspace" label="Workspace" />
                <TabsTrigger value="subscriptions" label="Subscriptions" />
                <TabsTrigger value="planlimitations" label="Plan Limitations" />
              </TabsList>
              <TabsContent value="workspace">
                <WorkspaceInfoTable
                  owner={owner}
                  workspaceVerifiedDomains={workspaceVerifiedDomains}
                  workspaceCreationDay={workspaceCreationDay}
                  extensionConfig={extensionConfig}
                  workspaceRetention={workspaceRetention}
                  workosEnvironmentId={workosEnvironmentId}
                />
              </TabsContent>
              <TabsContent value="subscriptions">
                <ActiveSubscriptionTable
                  owner={owner}
                  subscription={activeSubscription}
                  subscriptions={subscriptions}
                />
              </TabsContent>
              <TabsContent value="planlimitations">
                <PlanLimitationsTable subscription={activeSubscription} />
              </TabsContent>
            </Tabs>

            <div className="flex flex-grow flex-col">
              <PluginList
                pluginResourceTarget={{
                  resourceId: owner.sId,
                  resourceType: "workspaces",
                  workspace: owner,
                }}
              />
            </div>
          </div>
          <Tabs
            value={currentTab}
            onValueChange={handleTabChange}
            className="min-h-[1024px] w-full"
          >
            <TabsList>
              <TabsTrigger value="agents" label="Agents" />
              <TabsTrigger value="apps" label="Apps" />
              <TabsTrigger value="datasources" label="Data Sources" />
              <TabsTrigger value="datasourceviews" label="Data Source Views" />
              <TabsTrigger value="featureflags" label="Feature Flags" />
              <TabsTrigger value="groups" label="Groups" />
              <TabsTrigger value="mcpviews" label="MCP Server Views" />
              <TabsTrigger value="spaces" label="Spaces" />

              <TabsTrigger value="triggers" label="Triggers" />
              <TabsTrigger value="credits" label="Credits" />
            </TabsList>

            <TabsContent value="datasources">
              <DataSourceDataTable owner={owner} loadOnInit />
            </TabsContent>
            <TabsContent value="datasourceviews">
              <DataSourceViewsDataTable owner={owner} loadOnInit />
            </TabsContent>
            <TabsContent value="mcpviews">
              <MCPServerViewsDataTable owner={owner} loadOnInit />
            </TabsContent>
            <TabsContent value="spaces">
              <SpaceDataTable owner={owner} loadOnInit />
            </TabsContent>
            <TabsContent value="groups">
              <GroupDataTable owner={owner} loadOnInit />
            </TabsContent>
            <TabsContent value="agents">
              <AssistantsDataTable
                owner={owner}
                agentsRetention={agentsRetention}
                loadOnInit
              />
            </TabsContent>
            <TabsContent value="apps">
              <AppDataTable owner={owner} loadOnInit />
            </TabsContent>
            <TabsContent value="featureflags">
              <FeatureFlagsDataTable
                owner={owner}
                whitelistableFeatures={whitelistableFeatures}
                loadOnInit
              />
            </TabsContent>

            <TabsContent value="triggers">
              <TriggerDataTable owner={owner} loadOnInit />
            </TabsContent>
            <TabsContent value="credits">
              <CreditsDataTable
                owner={owner}
                subscription={activeSubscription}
                stripeSubscription={stripeSubscription}
                loadOnInit
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
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
                app: { appId, workspaceId: appWorkspaceId, appSpaceId },
              },
            ]) => {
              const url = `${baseUrl}/w/${appWorkspaceId}/spaces/${appSpaceId}/apps/${appId}/runs?wIdTarget=${owner.sId}`;

              return (
                <div key={appId}>
                  <div className="flex flex-row items-center space-x-2">
                    <div className="flex-1">
                      <h3
                        className="cursor-pointer text-lg font-semibold text-highlight-600"
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

WorkspacePage.getLayout = (
  page: ReactElement,
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name}`}>{page}</PokeLayout>;
};

export default WorkspacePage;
