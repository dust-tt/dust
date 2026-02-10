import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

import { AppDataTable } from "@app/components/poke/apps/table";
import { AssistantsDataTable } from "@app/components/poke/assistants/table";
import { CreditsDataTable } from "@app/components/poke/credits/table";
import { DataSourceViewsDataTable } from "@app/components/poke/data_source_views/table";
import { DataSourceDataTable } from "@app/components/poke/data_sources/table";
import { FeatureFlagsDataTable } from "@app/components/poke/features/table";
import { GroupDataTable } from "@app/components/poke/groups/table";
import { MCPServerViewsDataTable } from "@app/components/poke/mcp_server_views/table";
import { WorkspaceDatasourceRetrievalTreemapPluginChart } from "@app/components/poke/plugins/components/WorkspaceDatasourceRetrievalTreemapPluginChart";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import {
  PokeAlert,
  PokeAlertDescription,
  PokeAlertTitle,
} from "@app/components/poke/shadcn/ui/alert";
import { SkillsDataTable } from "@app/components/poke/skills/table";
import { SpaceDataTable } from "@app/components/poke/spaces/table";
import {
  ActiveSubscriptionTable,
  PlanLimitationsTable,
} from "@app/components/poke/subscriptions/table";
import { TriggerDataTable } from "@app/components/poke/triggers/table";
import { WorkspaceInfoTable } from "@app/components/poke/workspace/table";
import { WorkspaceUsageChart } from "@app/components/workspace/analytics/WorkspaceUsageChart";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { getRegionChipColor, getRegionDisplay } from "@app/lib/poke/regions";
import { usePokeRegion } from "@app/lib/swr/poke";
import { usePokeDataRetention } from "@app/poke/swr/data_retention";
import { usePokeWorkspaceInfo } from "@app/poke/swr/workspace_info";
import type { WorkspaceSegmentationType } from "@app/types";
import { isString } from "@app/types";

export function WorkspacePage() {
  const owner = useWorkspace();
  useSetPokePageTitle(owner.name ?? "Workspace");
  const { regionData } = usePokeRegion();

  const router = useAppRouter();

  const {
    data: workspaceInfo,
    isLoading,
    isError,
  } = usePokeWorkspaceInfo({
    owner,
    disabled: false,
  });

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
      } catch {
        window.alert("An error occurred while updating the workspace.");
      }
    }
  );

  const { data: dataRetention } = usePokeDataRetention({
    owner,
    disabled: false,
  });

  const agentsRetention = dataRetention?.agents ?? {};
  const isInMaintenance = owner.metadata?.maintenance;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !workspaceInfo) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading workspace information.</p>
      </div>
    );
  }

  const {
    activeSubscription,
    stripeSubscription,
    subscriptions,
    whitelistableFeatures,
    workspaceVerifiedDomains,
    workspaceCreationDay,
    extensionConfig,
    programmaticUsageConfig,
    workosEnvironmentId,
  } = workspaceInfo;

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
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{owner.name}</span>
            {regionData && (
              <Chip size="xs" color={getRegionChipColor(regionData.region)}>
                {getRegionDisplay(regionData.region)}
              </Chip>
            )}
          </div>
          <div className="flex gap-4 pt-2">
            <Button
              href={`/poke/${owner.sId}/memberships`}
              label="View members"
              variant="outline"
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
                  dataRetention={dataRetention}
                  workosEnvironmentId={workosEnvironmentId}
                />
              </TabsContent>
              <TabsContent value="subscriptions">
                <ActiveSubscriptionTable
                  owner={owner}
                  subscription={activeSubscription}
                  subscriptions={subscriptions}
                  programmaticUsageConfig={programmaticUsageConfig}
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
              <TabsTrigger value="skills" label="Skills" />
              <TabsTrigger value="spaces" label="Spaces" />

              <TabsTrigger value="triggers" label="Triggers" />
              <TabsTrigger value="credits" label="Credits" />
              <TabsTrigger value="analytics" label="Analytics" />
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
            <TabsContent value="skills">
              <SkillsDataTable owner={owner} loadOnInit />
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
            <TabsContent value="analytics">
              <div className="flex flex-col gap-6">
                <WorkspaceUsageChart workspaceId={owner.sId} period={30} />
                <WorkspaceDatasourceRetrievalTreemapPluginChart
                  workspaceId={owner.sId}
                  period={30}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
