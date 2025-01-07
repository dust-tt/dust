import {
  Button,
  Page,
  PlanetIcon,
  PlusIcon,
  RobotIcon,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  useHashParam,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentsGetViewType,
  LightAgentConfigurationType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import type { AssistantManagerTabsType } from "@app/components/assistant/AssistantsTable";
import {
  ASSISTANT_MANAGER_TABS,
  AssistantsTable,
} from "@app/components/assistant/AssistantsTable";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SCOPE_INFO } from "@app/components/assistant_builder/Sharing";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { subFilter } from "@app/lib/utils";

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

  const tabScope = ASSISTANT_MANAGER_TABS.includes(
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
  return ASSISTANT_MANAGER_TABS.includes(tab as AgentConfigurationScope);
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
    return selectedTab && isValidTab(selectedTab) ? selectedTab : "workspace";
  }, [selectedTab]);

  const includes: ("authors" | "usage" | "feedbacks")[] = (() => {
    if (assistantSearch) {
      return ["usage", "feedbacks"];
    }

    switch (activeTab) {
      case "edited_by_me":
      case "published":
        return ["authors", "usage", "feedbacks"];
      case "private":
      case "global":
      case "workspace":
        return ["usage", "feedbacks"];
      default:
        assertNever(activeTab);
    }
  })();

  // only fetch the agents that are relevant to the current scope, except when
  // user searches: search across all agents
  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView:
      activeTab === "private" || activeTab === "edited_by_me" || assistantSearch
        ? "list"
        : (activeTab as AgentsGetViewType),
    includes,
  });

  const filteredAgents = agentConfigurations.filter((a) => {
    if (assistantSearch) {
      return subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase());
    } else if (activeTab === "edited_by_me") {
      return a.lastAuthors?.includes("Me");
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
      window.alert(`Error toggling Assistant: ${data.error.message}`);
      return;
    }

    await mutateAgentConfigurations();
  };

  const tabs = [
    {
      label: "Edited my me",
      icon: PlanetIcon,
      scope: "edited_by_me",
    },
    ...(["workspace", "published", "global"] as AgentConfigurationScope[]).map(
      (scope) => ({
        label: SCOPE_INFO[scope].shortLabel,
        icon: SCOPE_INFO[scope].icon,
        scope,
      })
    ),
  ];

  const disabledTablineClass =
    "!border-element-500 !text-element-500 !cursor-default";

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
        <Page.Header title="Manage Assistants" icon={RobotIcon} />
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
                  label="Create an assistant"
                />
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-4 pt-3">
            <Tabs value={activeTab}>
              <TabsList>
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.label}
                    value={assistantSearch ? "" : tab.scope}
                    label={tab.label}
                    icon={tab.icon}
                    disabled={!!assistantSearch}
                    className={assistantSearch ? disabledTablineClass : ""}
                    onClick={() =>
                      !assistantSearch && setSelectedTab(tab.scope)
                    }
                  />
                ))}
              </TabsList>
            </Tabs>
            <Page.P>
              {assistantSearch
                ? "Searching across all assistants"
                : activeTab === "edited_by_me"
                  ? "Your edited and created assistants"
                  : SCOPE_INFO[activeTab].text}
            </Page.P>
            {filteredAgents.length > 0 || isAgentConfigurationsLoading ? (
              <AssistantsTable
                owner={owner}
                agents={filteredAgents}
                setShowDetails={setShowDetails}
                handleToggleAgentStatus={handleToggleAgentStatus}
                showDisabledFreeWorkspacePopup={showDisabledFreeWorkspacePopup}
                setShowDisabledFreeWorkspacePopup={
                  setShowDisabledFreeWorkspacePopup
                }
              />
            ) : (
              !assistantSearch && (
                <div className="pt-2">
                  <EmptyCallToAction
                    href={`/w/${owner.sId}/builder/assistants/create?flow=workspace_assistants`}
                    label="Create an Assistant"
                    icon={PlusIcon}
                  />
                </div>
              )
            )}
          </div>
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}
