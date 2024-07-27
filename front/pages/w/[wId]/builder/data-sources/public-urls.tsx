import {
  ContextItem,
  FolderOpenIcon,
  Icon,
  Page,
  PlusIcon,
  Popup,
  RobotIcon,
} from "@dust-tt/sparkle";
import { GlobeAltIcon } from "@dust-tt/sparkle";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type {
  ConnectorType,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import type { DataSourcesUsageByAgent } from "@app/lib/api/agent_data_sources";
import { getDataSourcesUsageByAgents } from "@app/lib/api/agent_data_sources";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import logger from "@app/logger/logger";

const { GA_TRACKING_ID = "" } = process.env;

type DataSourceWithConnector = DataSourceType & {
  connector: ConnectorType;
};

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  readOnly: boolean;
  dataSources: DataSourceWithConnector[];
  gaTrackingId: string;
  dataSourcesUsage: DataSourcesUsageByAgent;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();

  if (!owner || !plan || !subscription || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const allDataSources = await getDataSources(auth, { includeEditedBy: true });
  const dataSourcesUsage = await getDataSourcesUsageByAgents({
    auth,
    providerFilter: "webcrawler",
  });

  const connectorIds = allDataSources
    .filter(
      (ds) => ds.connectorProvider === "webcrawler" && ds.connectorId !== null
    )
    .map((ds) => ds.connectorId) as string[];

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const connectorsRes = await connectorsAPI.getConnectors(
    "webcrawler",
    connectorIds
  );
  if (connectorsRes.isErr()) {
    throw new Error("Failed to fetch connectors");
  }

  const dataSources = allDataSources
    .filter((ds) => ds.connectorProvider === "webcrawler")
    .map((ds) => {
      const connector = connectorsRes.value.find(
        (c) => c.id === ds.connectorId
      );
      if (!connector) {
        throw new Error("Connector not found");
      }
      return {
        ...ds,
        connector,
      };
    });

  return {
    props: {
      owner,
      subscription,
      plan,
      readOnly,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
      dataSourcesUsage,
    },
  };
});

export default function DataSourcesView({
  owner,
  subscription,
  plan,
  readOnly,
  dataSources,
  gaTrackingId,
  dataSourcesUsage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);

  const {
    submit: handleCreateDataSource,
    isSubmitting: isSubmittingCreateDataSource,
  } = useSubmitFunction(async () => {
    // Enforce plan limits: DataSources count.
    if (
      plan.limits.dataSources.count != -1 &&
      dataSources.length >= plan.limits.dataSources.count
    ) {
      setShowDatasourceLimitPopup(true);
    } else {
      void router.push(`/w/${owner.sId}/builder/data-sources/new-public-url`);
    }
  });
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_url",
      })}
    >
      <div className="w-full max-w-4xl pt-8">
        <Page.Vertical gap="xl" align="stretch">
          <Page.Header
            title="Websites"
            icon={GlobeAltIcon}
            description="Manage public URLs as data sources for the workspace."
          />

          {dataSources.length > 0 ? (
            <div className="relative">
              <Page.SectionHeader
                title=""
                description=""
                action={
                  !readOnly
                    ? {
                        label: "Add a public URL",
                        variant: "primary",
                        icon: PlusIcon,
                        onClick: handleCreateDataSource,

                        disabled: isSubmittingCreateDataSource,
                      }
                    : undefined
                }
              />
              <Popup
                show={showDatasourceLimitPopup}
                chipLabel={`${plan.name} plan`}
                description={`You have reached the limit of data sources (${plan.limits.dataSources.count} data sources). Upgrade your plan for unlimited datasources.`}
                buttonLabel="Check Dust plans"
                buttonClick={() => {
                  void router.push(`/w/${owner.sId}/subscription`);
                }}
                onClose={() => {
                  setShowDatasourceLimitPopup(false);
                }}
                className="absolute bottom-8 right-0"
              />
            </div>
          ) : (
            <EmptyCallToAction
              label="Create a new Public URL"
              onClick={handleCreateDataSource}
              icon={PlusIcon}
            />
          )}
          <ContextItem.List>
            {dataSources.map((ds) => (
              <ContextItem
                key={ds.name}
                title={
                  ds.name.length > 60
                    ? ds.name.substring(0, 60) + "..."
                    : ds.name
                }
                visual={
                  <ContextItem.Visual
                    visual={({ className }) =>
                      FolderOpenIcon({
                        className: className + " text-element-600",
                      })
                    }
                  />
                }
                onClick={() => {
                  void router.push(
                    `/w/${
                      owner.sId
                    }/builder/data-sources/${encodeURIComponent(ds.name)}`
                  );
                }}
                subElement={
                  <>
                    Added by: {ds.editedByUser?.fullName}
                    <span className="h-3 w-0.5 bg-element-500" />
                    <div className="flex items-center gap-1">
                      Used by: {dataSourcesUsage[ds.id] ?? 0}
                      <Icon visual={RobotIcon} size="xs" />
                    </div>
                  </>
                }
              >
                <div className="py-2">
                  <ConnectorSyncingChip
                    initialState={ds.connector}
                    workspaceId={ds.connector.workspaceId}
                    dataSourceName={ds.connector.dataSourceName}
                  />
                </div>
              </ContextItem>
            ))}
          </ContextItem.List>
        </Page.Vertical>
      </div>
    </AppLayout>
  );
}
