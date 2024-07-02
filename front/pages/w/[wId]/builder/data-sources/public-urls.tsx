import {
  ContextItem,
  FolderOpenIcon,
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
import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import ConnectorSyncingChip from "@app/components/data_source/DataSourceSyncChip";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import type { AgentEnabledDataSource } from "@app/lib/api/agent_data_sources";
import { getAgentEnabledDataSources } from "@app/lib/api/agent_data_sources";
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
  agentEnabledDataSources: AgentEnabledDataSource[];
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
  const agentEnabledDataSources = await getAgentEnabledDataSources({
    auth,
    providerFilter: "webcrawler",
  });

  const connectorsAPI = new ConnectorsAPI(logger);
  const dataSources = await Promise.all(
    allDataSources
      .filter((ds) => ds.connectorProvider === "webcrawler")
      .map(async (ds): Promise<DataSourceWithConnector> => {
        if (!ds.connectorId) {
          throw new Error("Connector ID is missing");
        }
        const connectorRes = await connectorsAPI.getConnector(ds.connectorId);
        if (connectorRes.isErr()) {
          throw new Error("Connector not found");
        }
        return {
          ...ds,
          connector: connectorRes.value,
        };
      })
  );

  return {
    props: {
      owner,
      subscription,
      plan,
      readOnly,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
      agentEnabledDataSources,
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
  agentEnabledDataSources,
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

  const agentCountPerDataSource = useMemo(() => {
    return _.countBy(agentEnabledDataSources, "dataSourceId");
  }, [agentEnabledDataSources]);

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
                ds.name.length > 60 ? ds.name.substring(0, 60) + "..." : ds.name
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
              action={
                <ConnectorSyncingChip
                  initialState={ds.connector}
                  workspaceId={ds.connector.workspaceId}
                  dataSourceName={ds.connector.dataSourceName}
                />
              }
            >
              <ContextItem.Description>
                <div className="mt-1 flex items-center gap-1 text-xs text-element-700">
                  <span>Added by: {ds.editedByUser?.fullName} | </span>
                  <span className="underline">
                    {agentCountPerDataSource[ds.id] ?? 0}
                  </span>
                  <RobotIcon />
                </div>
              </ContextItem.Description>
            </ContextItem>
          ))}
        </ContextItem.List>
      </Page.Vertical>
    </AppLayout>
  );
}
