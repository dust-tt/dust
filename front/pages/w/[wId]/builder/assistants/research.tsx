import {
  Avatar,
  CloudArrowDownIcon,
  ContextItem,
  DustLogoSquare,
  Page,
  PlusIcon,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { isRestrictedFromAgentCreation } from "@app/lib/auth";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import {
  getDisplayNameForDataSource,
  isRemoteDatabase,
} from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import type {
  APIError,
  DataSourceType,
  DataSourceViewType,
  LightAgentConfigurationType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  globalSpace: SpaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }

  if (await isRestrictedFromAgentCreation(owner)) {
    return {
      notFound: true,
    };
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  return {
    props: {
      owner,
      subscription,
      globalSpace: globalSpace.toJSON(),
    },
  };
});

function ResearchAgentDataSourceVisual({
  dataSourceView,
}: {
  dataSourceView: DataSourceViewType;
}) {
  const { isDark } = useTheme();

  return (
    <ContextItem.Visual
      visual={getConnectorProviderLogoWithFallback({
        provider: dataSourceView.dataSource.connectorProvider,
        fallback: CloudArrowDownIcon,
        isDark,
      })}
    />
  );
}

export default function EditResearchAssistant({
  owner,
  subscription,
  globalSpace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useSendNotification();

  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "global",
  });

  const {
    spaceDataSourceViews: unfilteredSpaceDataSourceViews,
    mutate: mutateDataSourceViews,
  } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId: globalSpace.sId,
  });

  // We do not support remote databases for the Research agent at the moment.
  const spaceDataSourceViews = useMemo(
    () =>
      unfilteredSpaceDataSourceViews.filter(
        (ds) => !isRemoteDatabase(ds.dataSource)
      ),
    [unfilteredSpaceDataSourceViews]
  );

  const sortedDatasources = spaceDataSourceViews.sort((a, b) => {
    if (a.dataSource.connectorProvider && !b.dataSource.connectorProvider) {
      return -1;
    }
    if (!a.dataSource.connectorProvider && b.dataSource.connectorProvider) {
      return 1;
    }
    if (
      a.dataSource.connectorProvider === "webcrawler" &&
      b.dataSource.connectorProvider !== "webcrawler"
    ) {
      return 1;
    }
    if (
      a.dataSource.connectorProvider !== "webcrawler" &&
      b.dataSource.connectorProvider === "webcrawler"
    ) {
      return -1;
    }
    return a.dataSource.name.localeCompare(b.dataSource.name);
  });

  const researchAgentConfiguration = agentConfigurations?.find(
    (c) => c.name === "research"
  );
  if (!researchAgentConfiguration) {
    return null;
  }

  const handleToggleAgentStatus = async (
    agent: LightAgentConfigurationType
  ) => {
    if (agent.status === "disabled_missing_datasource") {
      sendNotification({
        title: "Research Agent",
        description:
          "The Research agent requires at least one data source to be enabled.",
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
      window.alert(`Error toggling agent: ${data.error.message}`);
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
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}`,
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
        `Failed to update the Data Source (contact support@dust.tt for assistance) (internal error: type=${err.error.type} message=${err.error.message})`
      );
    }
    await mutateDataSourceViews();
    await mutateAgentConfigurations();
  };

  return (
    <AppCenteredLayout
      subscription={subscription}
      hideSidebar
      owner={owner}
      title={
        <AppLayoutSimpleCloseTitle
          title="Manage Research Agent"
          onClose={async () => {
            await router.push(`/w/${owner.sId}/builder/assistants`);
          }}
        />
      }
    >
      <Page.Header
        title="Research Agent"
        icon={DustLogoSquare}
        description="The Research agent is designed to do deep research with context on your company data and the internet."
      />
      <div className="flex flex-col space-y-8 pb-8 pt-8">
        <div className="flex w-full flex-col gap-4">
          {!!spaceDataSourceViews.length && (
            <>
              <Page.SectionHeader
                title="Availability"
                description="The Research agent requires at least one data source to be enabled."
              />

              <ContextItem
                title="Enable the Research agent for this workspace."
                visual={
                  <Avatar
                    visual="https://dust.tt/static/systemavatar/research_avatar_full.png"
                    size="xs"
                  />
                }
                action={
                  <SliderToggle
                    selected={researchAgentConfiguration?.status === "active"}
                    onClick={async () => {
                      await handleToggleAgentStatus(researchAgentConfiguration);
                    }}
                    disabled={
                      researchAgentConfiguration?.status ===
                      "disabled_free_workspace"
                    }
                  />
                }
              />
            </>
          )}
          {spaceDataSourceViews.length &&
          researchAgentConfiguration?.status !== "disabled_by_admin" ? (
            <>
              <Page.SectionHeader
                title="Data Sources and Connections"
                description="Configure which Company Data connections and data sources will be searched by the Research agent."
              />
              <>
                {
                  <ContextItem.List>
                    {sortedDatasources.map((dsView) => (
                      <ContextItem
                        key={dsView.id}
                        title={getDisplayNameForDataSource(dsView.dataSource)}
                        visual={
                          <ResearchAgentDataSourceVisual
                            dataSourceView={dsView}
                          />
                        }
                        action={
                          <SliderToggle
                            selected={
                              dsView.dataSource.assistantDefaultSelected
                            }
                            onClick={async () => {
                              await updateDatasourceSettings(
                                {
                                  assistantDefaultSelected:
                                    !dsView.dataSource.assistantDefaultSelected,
                                },
                                dsView.dataSource
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
          ) : researchAgentConfiguration?.status ===
            "disabled_missing_datasource" ? (
            <>
              <Page.SectionHeader
                title="This workspace doesn't currently have any data sources."
                description="Add Company Data connections or data sources to enable the Research agent."
                action={{
                  label: "Add data",
                  variant: "primary",
                  icon: PlusIcon,
                  onClick: async () => {
                    await router.push(
                      `/w/${owner.sId}/spaces/${globalSpace.sId}`
                    );
                  },
                }}
              />
            </>
          ) : null}
        </div>
      </div>
    </AppCenteredLayout>
  );
}

EditResearchAssistant.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
