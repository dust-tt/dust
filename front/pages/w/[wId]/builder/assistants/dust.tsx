import {
  Avatar,
  CloudArrowDownIcon,
  ContextItem,
  LogoSquareColorLogo,
  Page,
  PlusIcon,
  SliderToggle,
} from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceType,
  LightAgentConfigurationType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext } from "react";

import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations, useDataSources } from "@app/lib/swr";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function EditDustAssistant({
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const { agentConfigurations, mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "global",
    });
  const { dataSources, mutateDataSources } = useDataSources(owner);

  const sortedDatasources = dataSources.sort((a, b) => {
    if (a.connectorProvider && !b.connectorProvider) {
      return -1;
    }
    if (!a.connectorProvider && b.connectorProvider) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const dustAgentConfiguration = agentConfigurations?.find(
    (c) => c.name === "dust"
  );
  if (!dustAgentConfiguration) {
    return null;
  }

  const handleToggleAgentStatus = async (
    agent: LightAgentConfigurationType
  ) => {
    if (agent.status === "disabled_missing_datasource") {
      sendNotification({
        title: "Dust Assistant",
        description:
          "The Dust assistant requres at least one data source to be enabled.",
        type: "error",
      });
      return;
    }
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/global_agents/${agent.sId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status:
            agent.status === "disabled_by_admin"
              ? "active"
              : "disabled_by_admin",
        }),
      }
    );

    if (!res.ok) {
      const data = await res.json();
      window.alert(`Error toggling Assistant: ${data.error.message}`);
      return;
    }

    await mutateAgentConfigurations();
  };

  const updateDatasourceSettings = async (
    settings: {
      assistantDefaultSelected: boolean;
    },
    dataSource: DataSourceType
  ) => {
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      }
    );
    if (!res.ok) {
      const err = (await res.json()) as { error: APIError };
      window.alert(
        `Failed to update the Data Source (contact team@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
      );
    }
    await mutateDataSources();
    await mutateAgentConfigurations();
  };

  return (
    <AppLayout
      subscription={subscription}
      hideSidebar
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "workspace_assistants",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="Manage Dust Assistant"
          onClose={async () => {
            await router.push(`/w/${owner.sId}/builder/assistants`);
          }}
        />
      }
    >
      <div className="h-12" />
      <Page.Header
        title="Dust Assistant"
        icon={LogoSquareColorLogo}
        description="The Dust assistant is a general purpose assistant that has context on your company data."
      />
      <div className="flex flex-col space-y-8 pb-8 pt-8">
        <div className="flex w-full flex-col gap-4">
          {!!dataSources.length && (
            <>
              <Page.SectionHeader
                title="Availability"
                description="The Dust assistant requres at least one data source to be enabled."
              />

              <ContextItem
                title="Enable the Dust assistant for this workspace."
                visual={
                  <Avatar
                    visual="https://dust.tt/static/systemavatar/dust_avatar_full.png"
                    size="xs"
                  />
                }
                action={
                  <SliderToggle
                    selected={dustAgentConfiguration?.status === "active"}
                    onClick={async () => {
                      await handleToggleAgentStatus(dustAgentConfiguration);
                    }}
                    disabled={
                      dustAgentConfiguration?.status ===
                      "disabled_free_workspace"
                    }
                  />
                }
              />
            </>
          )}
          {dataSources.length &&
          dustAgentConfiguration?.status !== "disabled_by_admin" ? (
            <>
              <Page.SectionHeader
                title="Data Sources and Connections"
                description="Configure which connections and data sources will be searched by the Dust assistant."
              />
              <>
                {
                  <ContextItem.List>
                    {sortedDatasources.map((ds) => (
                      <ContextItem
                        key={ds.id}
                        title={getDisplayNameForDataSource(ds)}
                        visual={
                          <ContextItem.Visual
                            visual={
                              ds.connectorProvider
                                ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider]
                                    .logoComponent
                                : CloudArrowDownIcon
                            }
                          />
                        }
                        action={
                          <SliderToggle
                            selected={ds.assistantDefaultSelected}
                            onClick={async () => {
                              await updateDatasourceSettings(
                                {
                                  assistantDefaultSelected:
                                    !ds.assistantDefaultSelected,
                                },
                                ds
                              );
                            }}
                          />
                        }
                      />
                    ))}
                  </ContextItem.List>
                }
              </>
            </>
          ) : dustAgentConfiguration?.status ===
            "disabled_missing_datasource" ? (
            <>
              <Page.SectionHeader
                title="This workspace doesn't currently have any data sources."
                description="Add connections or data sources to enable the Dust assistant."
                action={{
                  label: "Add connections",
                  variant: "primary",
                  icon: PlusIcon,
                  onClick: async () => {
                    await router.push(
                      `/w/${owner.sId}/builder/data-sources/managed`
                    );
                  },
                }}
              />
            </>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}
