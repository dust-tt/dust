import {
  CloudArrowDownIcon,
  ContextItem,
  LogoSquareColorLogo,
  PageHeader,
  SectionHeader,
  SliderToggle,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { APIError } from "@app/lib/error";
import { useAgentConfigurations, useDataSources } from "@app/lib/swr";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !user || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function EditDustAssistant({
  user,
  owner,
  gaTrackingId,
}: // dataSources,
InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { agentConfigurations, mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
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
    void router.push(`/w/${owner.sId}/builder/assistants`);
    return null;
  }

  const handleToggleAgentStatus = async (agent: AgentConfigurationType) => {
    if (agent.status === "disabled_free_workspace") {
      window.alert(
        `@${agent.name} is only available on our paid plans. Contact us at team@dust.tt to get access.`
      );
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
  };

  return (
    <AppLayout
      hideSidebar
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "assistants" })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="Manage Dust Assistant"
          onClose={async () => {
            await router.push(`/w/${owner.sId}/builder/assistants`);
          }}
        />
      }
    >
      <div className="pt-8" />
      <PageHeader
        title="Dust Assistant"
        icon={LogoSquareColorLogo}
        description="Configure the @dust assistant for this workspace."
      />
      <div className="flex flex-col space-y-8 pb-8 pt-8">
        <div className="flex w-full flex-col gap-4">
          <SectionHeader
            title="Availability"
            description="Select whether or not @dust is available as a standalone assistant for this workspace."
          />
          <ContextItem
            title="Enabled"
            visual={null}
            action={
              <SliderToggle
                selected={dustAgentConfiguration?.status === "active"}
                onClick={async () => {
                  await handleToggleAgentStatus(dustAgentConfiguration);
                }}
              />
            }
          />
          {dustAgentConfiguration?.status === "active" ? (
            <>
              <SectionHeader
                title="Data Sources"
                description="Configure which connections and data sources will be searched by the Dust Assistant."
              />
              <>
                {
                  <ContextItem.List>
                    {sortedDatasources.map((ds) => (
                      <ContextItem
                        key={ds.id}
                        title={
                          ds.connectorProvider
                            ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider]
                                .name
                            : ds.name
                        }
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
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}
