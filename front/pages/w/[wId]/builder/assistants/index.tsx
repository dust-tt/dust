import {
  Avatar,
  Button,
  Cog6ToothIcon,
  ContextItem,
  Page,
  PencilSquareIcon,
  PlusIcon,
  Popup,
  RobotIcon,
  Searchbar,
  SliderToggle,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { compareAgentsForSort } from "@app/lib/assistant";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";
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

  if (!owner || !user || !auth.isUser()) {
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
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);

  const workspaceAgents = agentConfigurations.filter(
    (a) => a.scope === "workspace"
  );
  const filtered = workspaceAgents.filter((a) => {
    return subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase());
  });

  const dustAgents = agentConfigurations.filter((a) => a.scope === "global");
  dustAgents.sort(compareAgentsForSort);

  const isBuilder = owner.role === "builder" || owner.role === "admin";

  const handleToggleAgentStatus = async (agent: AgentConfigurationType) => {
    if (agent.status === "disabled_free_workspace") {
      setShowDisabledFreeWorkspacePopup(agent.sId);
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
        <Searchbar
          name="search"
          placeholder="AssistantName"
          value={assistantSearch}
          onChange={(s) => {
            setAssistantSearch(s);
          }}
        />
        <ContextItem.List className="text-element-900">
          {filtered.map((agent) => (
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
        <Page.SectionHeader
          title="Dust Assistants"
          description='Assistants built by Dust for multiple use&nbsp;cases. For instance, use "@help" for any&nbsp;question Dust related, use&nbsp;the&nbsp;handle "@notion" to&nbsp;target specifically knowledge on&nbsp;Notion…'
        />
        <ContextItem.List>
          {dustAgents.map((agent) => (
            <ContextItem
              key={agent.sId}
              title={`@${agent.name}`}
              visual={
                <Avatar visual={<img src={agent.pictureUrl} />} size={"sm"} />
              }
              action={
                ["helper"].includes(agent.sId) ? null : agent.sId === "dust" ? (
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
                  <div className="relative">
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
                    <Popup
                      show={showDisabledFreeWorkspacePopup === agent.sId}
                      className="absolute bottom-8 right-0"
                      chipLabel={`Free plan`}
                      description={`@${agent.name} is only available on our paid plans.`}
                      buttonLabel="Check Dust plans"
                      buttonClick={() => {
                        void router.push(`/w/${owner.sId}/subscription`);
                      }}
                      onClose={() => {
                        setShowDisabledFreeWorkspacePopup(null);
                      }}
                    />
                  </div>
                )
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
