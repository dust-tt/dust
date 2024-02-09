import {
  AssistantPreview2,
  Avatar,
  BookOpenIcon,
  Button,
  Cog6ToothIcon,
  ContextItem,
  Page,
  PlusIcon,
  Popup,
  RobotSharedIcon,
  Searchbar,
  SliderToggle,
  Tab,
} from "@dust-tt/sparkle";
import type { AgentConfigurationScope, SubscriptionType } from "@dust-tt/types";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, isBuilder } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { SCOPE_INFO } from "@app/components/assistant/Sharing";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import {
  assistantUsageMessage,
  compareAgentsForSort,
} from "@app/lib/assistant";
import { Authenticator, getSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withGetServerSidePropsLogging<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  tabScope: AgentConfigurationScope;
  gaTrackingId: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }
  const tabScope = Object.keys(SCOPE_INFO).includes(
    context.query.tabScope as AgentConfigurationScope
  )
    ? (context.query.tabScope as AgentConfigurationScope)
    : "workspace";
  return {
    props: {
      owner,
      tabScope,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function WorkspaceAssistants({
  owner,
  tabScope,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const includes: ("authors" | "usage")[] = (() => {
    switch (tabScope) {
      case "published":
        return ["authors"];
      case "private":
      case "workspace":
        return ["usage"];
      case "global":
        return [];
      default:
        assertNever(tabScope);
    }
  })();

  // only fetch the agents that are relevant to the current scope
  const {
    agentConfigurations,
    mutateAgentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: tabScope === "private" ? "list" : tabScope,
    includes,
  });
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);

  const [assistantSearch, setAssistantSearch] = useState<string>("");

  const filteredAgents = agentConfigurations.filter((a) => {
    return (
      a.scope === tabScope && // to filter private agents from 'list' view
      subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase())
    );
  });

  filteredAgents.sort(compareAgentsForSort);
  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);

  const handleToggleAgentStatus = async (
    agent: LightAgentConfigurationType
  ) => {
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
  const tabs = (
    ["workspace", "published", "private", "global"] as AgentConfigurationScope[]
  ).map((scope) => ({
    label: SCOPE_INFO[scope].shortLabel,
    current: scope === tabScope,
    icon: SCOPE_INFO[scope].icon,
    href: `/w/${owner.sId}/builder/assistants?tabScope=${scope}`,
  }));

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
        owner,
        current: "workspace_assistants",
      })}
    >
      {showDetails && (
        <AssistantDetails
          owner={owner}
          assistantId={showDetails.sId}
          show={showDetails !== null}
          onClose={() => setShowDetails(null)}
          mutateAgentConfigurations={mutateAgentConfigurations}
        />
      )}

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header title="Manage Assistants" icon={RobotSharedIcon} />
        <Page.Vertical gap="md" align="stretch">
          <div className="flex flex-row gap-2">
            <Searchbar
              name="search"
              placeholder="Search (Name)"
              value={assistantSearch}
              onChange={(s) => {
                setAssistantSearch(s);
              }}
            />
            <Button.List>
              <Link
                href={`/w/${owner.sId}/builder/assistants/new?flow=workspace_assistants`}
              >
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Create an assistant"
                />
              </Link>
              <Link href={`/w/${owner.sId}/assistant/gallery`}>
                <Button
                  variant="primary"
                  icon={BookOpenIcon}
                  label="Explore the Gallery"
                />
              </Link>
            </Button.List>
          </div>
          <div className="flex flex-col gap-4">
            <Tab tabs={tabs} />
            <Page.P>{SCOPE_INFO[tabScope].text}</Page.P>
            {filteredAgents.length > 0 || isAgentConfigurationsLoading ? (
              <AgentViewForScope
                owner={owner}
                agents={filteredAgents}
                tabScope={tabScope}
                setShowDetails={setShowDetails}
                handleToggleAgentStatus={handleToggleAgentStatus}
                showDisabledFreeWorkspacePopup={showDisabledFreeWorkspacePopup}
                setShowDisabledFreeWorkspacePopup={
                  setShowDisabledFreeWorkspacePopup
                }
              />
            ) : (
              <div className="pt-2">
                <EmptyCallToAction
                  href={`/w/${owner.sId}/builder/assistants/new?flow=workspace_assistants`}
                  label="Create an Assistant"
                />
              </div>
            )}
          </div>
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}

function AgentViewForScope({
  owner,
  agents,
  tabScope,
  setShowDetails,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
}: {
  owner: WorkspaceType;
  agents: LightAgentConfigurationType[];
  tabScope: AgentConfigurationScope;
  setShowDetails: (agent: LightAgentConfigurationType) => void;
  handleToggleAgentStatus: (
    agent: LightAgentConfigurationType
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
}) {
  const router = useRouter();
  if (tabScope === "published") {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {agents.map((a) => (
          <AssistantPreview2
            key={a.sId}
            title={a.name}
            pictureUrl={a.pictureUrl}
            subtitle={a.lastAuthors?.join(", ") ?? ""}
            description={a.description}
            variant="list"
            onClick={() => setShowDetails(a)}
          />
        ))}
      </div>
    );
  }

  return (
    <ContextItem.List>
      {agents.map((agent) => (
        <ContextItem
          key={agent.sId}
          title={`@${agent.name}`}
          subElement={
            agent.scope === "global"
              ? null
              : assistantUsageMessage({
                  assistantName: agent.name,
                  usage: agent.usage || null,
                  isLoading: false,
                  isError: false,
                  shortVersion: true,
                })
          }
          visual={<Avatar visual={<img src={agent.pictureUrl} />} size="md" />}
          onClick={() => setShowDetails(agent)}
          action={
            agent.scope === "global" ? (
              <GlobalAgentAction agent={agent} />
            ) : null
          }
        >
          <ContextItem.Description>
            <div className="text-element-700">{agent.description}</div>
          </ContextItem.Description>
        </ContextItem>
      ))}
    </ContextItem.List>
  );

  function GlobalAgentAction({
    agent,
  }: {
    agent: LightAgentConfigurationType;
  }) {
    if (agent.sId === "helper") {
      return null;
    }

    if (agent.sId === "dust") {
      return (
        <Button
          variant="secondary"
          icon={Cog6ToothIcon}
          label="Manage"
          size="sm"
          disabled={!isBuilder(owner)}
          onClick={(e) => {
            e.stopPropagation();
            void router.push(`/w/${owner.sId}/builder/assistants/dust`);
          }}
        />
      );
    }

    return (
      <div className="relative">
        <SliderToggle
          size="xs"
          onClick={async (e) => {
            e.stopPropagation();
            await handleToggleAgentStatus(agent);
          }}
          selected={agent.status === "active"}
          disabled={agent.status === "disabled_missing_datasource"}
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
    );
  }
}
