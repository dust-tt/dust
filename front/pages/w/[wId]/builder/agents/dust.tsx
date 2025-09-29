import {
  Avatar,
  Button,
  Cog6ToothIcon,
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

function DustAgentDataSourceVisual({
  dataSourceView,
}: {
  dataSourceView: DataSourceViewType;
}) {
  const { isDark } = useTheme();

  return (
    <ContextItem.Visual
      visual={getConnectorProviderLogoWithFallback({
        provider: dataSourceView.dataSource.connectorProvider,
        isDark,
      })}
    />
  );
}

export default function EditDustAgent({
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
    category: "managed",
  });

  // We do not support remote databases for the Dust agent at the moment.
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
        title: "Dust Agent",
        description:
          "The Dust agent requires at least one data source to be enabled.",
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
          title="Manage Dust Agent"
          onClose={async () => {
            await router.push(`/w/${owner.sId}/builder/agents`);
          }}
        />
      }
    >
      <Page.Header
        title="Dust Agent"
        icon={DustLogoSquare}
        description="The Dust agent is a general purpose agent that has context on your company data."
      />
      <div className="flex flex-col space-y-8 pb-8 pt-8">
        <div className="flex w-full flex-col gap-4">
          {!!spaceDataSourceViews.length && (
            <>
              <Page.SectionHeader
                title="Availability"
                description="The Dust agent requires at least one data source to be enabled."
              />

              <ContextItem
                title="Enable the Dust agent for this workspace."
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
          {spaceDataSourceViews.length &&
          dustAgentConfiguration?.status !== "disabled_by_admin" ? (
            <>
              <Page.SectionHeader
                title="Data Sources and Connections"
                description="Configure which Company Data connections and data sources will be searched by the Dust agent."
              />
              <ContextItem.List>
                {sortedDatasources.map((dsView) => (
                  <ContextItem
                    key={dsView.id}
                    title={getDisplayNameForDataSource(dsView.dataSource)}
                    visual={
                      <DustAgentDataSourceVisual dataSourceView={dsView} />
                    }
                    action={
                      <SliderToggle
                        selected={dsView.dataSource.assistantDefaultSelected}
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
                <ContextItem
                  title="Websites"
                  visual={
                    <ContextItem.Visual
                      visual={getConnectorProviderLogoWithFallback({
                        provider: "webcrawler",
                      })}
                    />
                  }
                  action={<Button icon={Cog6ToothIcon} variant="outline" />}
                />
                <ContextItem
                  title="Folders"
                  visual={
                    <ContextItem.Visual
                      visual={getConnectorProviderLogoWithFallback({
                        provider: null,
                      })}
                    />
                  }
                  action={<Button icon={Cog6ToothIcon} variant="outline" />}
                />
              </ContextItem.List>
            </>
          ) : dustAgentConfiguration?.status ===
            "disabled_missing_datasource" ? (
            <Page.SectionHeader
              title="This workspace doesn't currently have any data sources."
              description="Add Company Data connections or data sources to enable the Dust agent."
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
          ) : null}
        </div>
      </div>
    </AppCenteredLayout>
  );
}

EditDustAgent.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
