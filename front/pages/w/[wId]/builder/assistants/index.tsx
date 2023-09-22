import {
  Avatar,
  Button,
  ContextItem,
  PageHeader,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  SectionHeader,
  SliderToggle,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { useAgentConfigurations } from "@app/lib/swr";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
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

  if (
    !owner ||
    !user ||
    !auth.isBuilder() ||
    !isDevelopmentOrDustWorkspace(owner)
  ) {
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

  const handleToggleAgentStatus = async (agent: AgentConfigurationType) => {
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
      <PageHeader
        title="Assistants Builder"
        icon={RobotIcon}
        description="Build an assistant."
      />
      <div className="flex flex-col gap-4 pb-4">
        <div>
          <SectionHeader
            title="Dust Assistants"
            description="AI assistants with specific capabilities that you can call using the “@” handle(for instance @myAssistant, @spelling, @translate)."
          />
          <ContextItem.List className="mt-8  text-element-900">
            {dustAgents.map((agent) => (
              <ContextItem
                key={agent.sId}
                title={`@${agent.name}`}
                visual={
                  <Avatar visual={<img src={agent.pictureUrl} />} size={"sm"} />
                }
                action={
                  agent.sId !== "helper" ? (
                    <SliderToggle
                      size="sm"
                      onClick={async () => {
                        await handleToggleAgentStatus(agent);
                      }}
                      selected={agent.status === "active"}
                      disabled={agent.status === "disabled_missing_datasource"}
                    />
                  ) : null
                }
              >
                <ContextItem.Description>
                  <div className="text-element-700">{agent.description}</div>
                </ContextItem.Description>
              </ContextItem>
            ))}
          </ContextItem.List>
        </div>
        <div>
          <SectionHeader
            title="Custom Assistants"
            description="Build your own Assistant, use specific instructions and specific data sources to get better answers."
            action={{
              label: "Create a new Assistant",
              variant: "primary",
              icon: PlusIcon,
              size: "sm",
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
        </div>
      </div>
    </AppLayout>
  );
}
