import {
  Avatar,
  Button,
  Cog6ToothIcon,
  ContextItem,
  Page,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  SliderToggle,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { compareAgentsForSort } from "@app/lib/assistant";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { AgentConfigurationType } from "@app/types/assistant/agent";
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

  if (!owner || !user) {
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

export default function AssistantsBuilder({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const { agentConfigurations, mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
    });

  const workspaceAgents = agentConfigurations.filter(
    (a) => a.scope === "workspace"
  );
  const dustAgents = agentConfigurations.filter((a) => a.scope === "global");
  dustAgents.sort(compareAgentsForSort);

  const isBuilder = owner.role === "builder" || owner.role === "admin";

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

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "assistants" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Assistants"
          icon={RobotIcon}
          description="Create, manage and deploy Assistants to your collaborators."
        />
        <Page.SectionHeader
          title="Dust Assistants"
          description='Assistants built by Dust for multiple use&nbsp;cases. For instance, use "@help" for any&nbsp;question Dust related, use&nbsp;the&nbsp;handle "@notion" to&nbsp;target specifically knowledge on&nbsp;Notion…'
        />
        <ContextItem.List className="mt-8 text-element-900">
          {dustAgents.map((agent) => (
            <ContextItem
              key={agent.sId}
              title={`@${agent.name}`}
              visual={
                <Avatar visual={<img src={agent.pictureUrl} />} size={"sm"} />
              }
              action={
                ["helper", "gpt-4"].includes(agent.sId) ? null : agent.sId ===
                  "dust" ? (
                  <Button
                    variant="secondary"
                    icon={Cog6ToothIcon}
                    label="Manage"
                    size="sm"
                    disabled={!isBuilder}
                    onClick={() => {
                      void router.push(
                        `/w/${owner.sId}/builder/assistants/dust`
                      );
                    }}
                  />
                ) : (
                  <SliderToggle
                    size="sm"
                    onClick={async () => {
                      await handleToggleAgentStatus(agent);
                    }}
                    selected={agent.status === "active"}
                    disabled={
                      agent.status === "disabled_missing_datasource" ||
                      !isBuilder
                    }
                  />
                )
              }
            >
              <ContextItem.Description>
                <div className="text-element-700">{agent.description}</div>
              </ContextItem.Description>
            </ContextItem>
          ))}
        </ContextItem.List>
        <Page.SectionHeader
          title="Custom Assistants"
          description="Build your Assistant, tailored to your needs. Write specific&nbsp;instructions, select&nbsp;specific data sources to&nbsp;get better&nbsp;answers."
          action={{
            label: "Create a new Assistant",
            variant: "primary",
            icon: PlusIcon,
            size: "sm",
            disabled: !isBuilder,
            onClick: () => {
              void router.push(`/w/${owner.sId}/builder/assistants/new`);
            },
          }}
        />
        <ContextItem.List className="mt-8  text-element-900">
          {workspaceAgents.map((agent) => (
            <ContextItem
              key={agent.sId}
              title={`@${agent.name}`}
              visual={
                <Avatar visual={<img src={agent.pictureUrl} />} size={"sm"} />
              }
              action={
                <Button
                  variant="secondary"
                  icon={PencilSquareIcon}
                  label="Edit"
                  size="sm"
                  disabled={!isBuilder}
                  onClick={() => {
                    void router.push(
                      `/w/${owner.sId}/builder/assistants/${agent.sId}`
                    );
                  }}
                />
              }
            >
              <ContextItem.Description>
                <div className="text-element-700">{agent.description}</div>
              </ContextItem.Description>
            </ContextItem>
          ))}
        </ContextItem.List>
      </Page.Vertical>
    </AppLayout>
  );
}
