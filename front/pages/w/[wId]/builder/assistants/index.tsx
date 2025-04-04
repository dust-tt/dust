import {
  Button,
  Page,
  PlusIcon,
  RobotIcon,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  useHashParam,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import type { AssistantManagerTabsType } from "@app/components/assistant/AssistantsTable";
import {
  ASSISTANT_MANAGER_TABS,
  AssistantsTable,
} from "@app/components/assistant/AssistantsTable";
import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { subFilter } from "@app/lib/utils";
import type {
  AgentsGetViewType,
  LightAgentConfigurationType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  tabScope: AssistantManagerTabsType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }

  await MCPServerViewResource.ensureAllDefaultActionsAreCreated(auth);

  const tabScope = ASSISTANT_MANAGER_TABS.map((tab) => tab.id).includes(
    context.query.tabScope as AssistantManagerTabsType
  )
    ? (context.query.tabScope as AssistantManagerTabsType)
    : "workspace";
  return {
    props: {
      owner,
      tabScope,
      subscription,
    },
  };
});

function isValidTab(tab?: string): tab is AssistantManagerTabsType {
  return ASSISTANT_MANAGER_TABS.map((tab) => tab.id).includes(
    tab as AssistantManagerTabsType
  );
}

export default function WorkspaceAssistants({
  owner,
  tabScope,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("tabScope", tabScope);

  const activeTab = useMemo(() => {
    if (assistantSearch.trim() !== "") {
      return "search";
    }

    return selectedTab && isValidTab(selectedTab) ? selectedTab : "workspace";
  }, [assistantSearch, selectedTab]);

  // only fetch the agents that are relevant to the current scope, except when
  // user searches: search across all agents
  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView:
      activeTab === "search" ? "list" : (activeTab as AgentsGetViewType),
    includes: ["usage", "feedbacks"],
  });

  const filteredAgents = agentConfigurations.filter((a) => {
    if (assistantSearch && assistantSearch.trim() !== "") {
      return subFilter(
        assistantSearch.trim().toLowerCase(),
        a.name.toLowerCase()
      );
    } else if (activeTab === "current_user") {
      return true;
    } else {
      return a.scope === activeTab;
    }
  });

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
      window.alert(`Error toggling agent: ${data.error.message}`);
      return;
    }

    await mutateAgentConfigurations();
  };

  // if search is active, only show the search tab, otherwise show all tabs with agents except the search tab
  const visibleTabs = useMemo(() => {
    const searchTab = ASSISTANT_MANAGER_TABS.find((tab) => tab.id === "search");
    if (!searchTab) {
      throw new Error("Unexpected: Search tab not found");
    }

    return assistantSearch.trim() !== ""
      ? [searchTab]
      : ASSISTANT_MANAGER_TABS.filter((tab) => tab.id !== "search");
  }, [assistantSearch]);

  const disabledTablineClass =
    "!border-primary-500 !text-primary-500 !cursor-default";

  const searchBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        if (searchBarRef.current) {
          searchBarRef.current.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, []);

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <AssistantDetails
          owner={owner}
          assistantId={showDetails?.sId || null}
          onClose={() => setShowDetails(null)}
        />
        <Page.Vertical gap="xl" align="stretch">
          <Page.Header title="Manage Agents" icon={RobotIcon} />
          <Page.Vertical gap="md" align="stretch">
            <div className="flex flex-row gap-2">
              <SearchInput
                ref={searchBarRef}
                name="search"
                placeholder="Search (Name)"
                value={assistantSearch}
                onChange={(s) => {
                  setAssistantSearch(s);
                }}
              />
              <div className="flex gap-2">
                <Link
                  href={`/w/${owner.sId}/builder/assistants/create?flow=workspace_assistants`}
                >
                  <Button
                    variant="primary"
                    icon={PlusIcon}
                    label="Create an agent"
                    data-gtm-label="assistantCreationButton"
                    data-gtm-location="assistantsWorkspace"
                  />
                </Link>
              </div>
            </div>
            <div className="flex flex-col pt-3">
              <Tabs value={activeTab}>
                <TabsList>
                  {visibleTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      label={tab.label}
                      icon={tab.icon}
                      className={assistantSearch ? disabledTablineClass : ""}
                      onClick={() => !assistantSearch && setSelectedTab(tab.id)}
                      tooltip={
                        ASSISTANT_MANAGER_TABS.find((t) => t.id === tab.id)
                          ?.description
                      }
                    />
                  ))}
                </TabsList>
              </Tabs>
              {filteredAgents.length > 0 || isAgentConfigurationsLoading ? (
                <AssistantsTable
                  owner={owner}
                  agents={filteredAgents}
                  setShowDetails={setShowDetails}
                  handleToggleAgentStatus={handleToggleAgentStatus}
                  showDisabledFreeWorkspacePopup={
                    showDisabledFreeWorkspacePopup
                  }
                  setShowDisabledFreeWorkspacePopup={
                    setShowDisabledFreeWorkspacePopup
                  }
                />
              ) : (
                !assistantSearch && (
                  <div className="pt-2">
                    <EmptyCallToAction
                      href={`/w/${owner.sId}/builder/assistants/create?flow=workspace_assistants`}
                      label="Create an agent"
                      icon={PlusIcon}
                      data-gtm-label="assistantCreationButton"
                      data-gtm-location="assistantsWorkspace"
                    />
                  </div>
                )
              )}
            </div>
          </Page.Vertical>
        </Page.Vertical>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
