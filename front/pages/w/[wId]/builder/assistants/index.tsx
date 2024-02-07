import {
  Avatar,
  BookOpenIcon,
  Button,
  Cog6ToothIcon,
  ContextItem,
  DropdownMenu,
  Page,
  PencilSquareIcon,
  PlusIcon,
  Popup,
  RobotIcon,
  Searchbar,
  SliderToggle,
  Tab,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { AgentConfigurationScope, SubscriptionType } from "@dust-tt/types";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import {
  DeleteAssistantDialog,
  RemoveAssistantFromWorkspaceDialog,
} from "@app/components/assistant/AssistantActions";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import {
  assistantUsageMessage,
  compareAgentsForSort,
} from "@app/lib/assistant";
import { Authenticator, getSession } from "@app/lib/auth";
import { useAgentConfigurations, useFeatures } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";
import { SCOPE_INFO } from "@app/components/assistant/Sharing";
import { AssistantDetails } from "@app/components/assistant/AssistantDetails";

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

  if (!owner || !auth.isUser() || !subscription) {
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
  const router = useRouter();

  // only fetch the agents that are relevant to the current scope
  const {
    agentConfigurations,
    mutateAgentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: tabScope === "private" ? "list" : tabScope,
    includes: ["usage"],
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
  const { features } = useFeatures(owner);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
        owner,
        current: "workspace_assistants",
        crawlerEnabled: features?.includes("crawler"),
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
        <Page.Header title="Manage Assistants" icon={RobotIcon} />
        <Page.Vertical gap="md" align="stretch">
          <div className="flex flex-row gap-2">
            <div className="flex w-full flex-1">
              <div className="w-full">
                <Searchbar
                  name="search"
                  placeholder="Search (Name)"
                  value={assistantSearch}
                  onChange={(s) => {
                    setAssistantSearch(s);
                  }}
                />
              </div>
            </div>
            <Button.List>
              <Link href={`/w/${owner.sId}/builder/assistants/new`}>
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
                  label="Explore the Assistant Gallery"
                />
              </Link>
            </Button.List>
          </div>
          <Tab tabs={tabs} />
          {filteredAgents.length > 0 || isAgentConfigurationsLoading ? (
            <ContextItem.List className="text-element-900">
              {filteredAgents.map((agent) => (
                <ContextItem
                  key={agent.sId}
                  title={`@${agent.name}`}
                  subElement={assistantUsageMessage({
                    assistantName: agent.name,
                    usage: agent.usage || null,
                    isLoading: false,
                    isError: false,
                    shortVersion: true,
                  })}
                  visual={
                    <Avatar visual={<img src={agent.pictureUrl} />} size="md" />
                  }
                  onClick={() => setShowDetails(agent)}
                >
                  <ContextItem.Description>
                    <div className="text-element-700">{agent.description}</div>
                  </ContextItem.Description>
                </ContextItem>
              ))}
            </ContextItem.List>
          ) : (
            <div className="pt-2">
              <EmptyCallToAction
                href={`/w/${owner.sId}/builder/assistants/new?flow=workspace_assistants`}
                label="Create an Assistant"
              />
            </div>
          )}
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}
