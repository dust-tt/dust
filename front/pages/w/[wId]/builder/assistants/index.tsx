import {
  Button,
  DustIcon,
  MagnifyingGlassIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  TrashIcon,
  useHashParam,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantsTable } from "@app/components/assistant/AssistantsTable";
import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type {
  LightAgentConfigurationType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";
import { isAdmin, isBuilder } from "@app/types";

export const ASSISTANT_MANAGER_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  {
    id: "all",
    label: "All agents",
    icon: RobotIcon,
    description: "All agents.",
  },
  {
    id: "editable_by_me",
    label: "Editable by me",
    icon: PencilSquareIcon,
    description: "Edited or created by you.",
  },
  {
    id: "global",
    label: "Default",
    icon: DustIcon,
    description: "Default agents provided by Dust.",
  },
  {
    id: "archived",
    label: "Archived",
    icon: TrashIcon,
    description: "Archived agents.",
  },
  {
    id: "search",
    label: "Searching across all agents",
    icon: MagnifyingGlassIcon,
    description: "Searching across all agents",
  },
] as const;

export type AssistantManagerTabsType =
  (typeof ASSISTANT_MANAGER_TABS)[number]["id"];

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }

  await MCPServerViewResource.ensureAllDefaultActionsAreCreated(auth);

  return {
    props: {
      owner,
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
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "all");

  const activeTab = useMemo(() => {
    if (assistantSearch.trim() !== "") {
      return "search";
    }

    return selectedTab && isValidTab(selectedTab) ? selectedTab : "all";
  }, [assistantSearch, selectedTab]);

  // only fetch the agents that are relevant to the current scope, except when
  // user searches: search across all agents
  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    includes: ["usage", "feedbacks"],
  });

  const { agentConfigurations: archivedAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "archived",
      includes: ["usage", "feedbacks"],
    });

  const agentsByTab = useMemo(() => {
    const allAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter((a) => a.status === "active")
      .sort((a, b) => {
        return compareForFuzzySort(
          "",
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      });

    return {
      // do not show the "all" tab while still loading all agents
      all: allAgents,
      editable_by_me: allAgents.filter(
        (a) =>
          a.scope !== "global" &&
          (isAdmin(owner) ||
            (a.scope === "published" && isBuilder(owner)) ||
            a.scope === "private") // TODO: add/replace with editors group check
      ),
      global: allAgents.filter((a) => a.scope === "global"),
      archived: archivedAgentConfigurations.sort((a, b) => {
        return compareForFuzzySort(
          "",
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      }),
      search: agentConfigurations
        .filter(
          (a) =>
            a.status === "active" &&
            // Filters on search query
            subFilter(assistantSearch, a.name.toLowerCase())
        )
        .sort((a, b) => {
          return compareForFuzzySort(
            assistantSearch,
            a.name.toLowerCase(),
            b.name.toLowerCase()
          );
        }),
    };
  }, [
    agentConfigurations,
    archivedAgentConfigurations,
    owner,
    assistantSearch,
  ]);

  const { uniqueTags } = useMemo(() => {
    const tags = agentConfigurations.flatMap((a) => a.tags);
    // Remove duplicate tags by unique sId
    const uniqueTags = Array.from(
      new Map(tags.map((tag) => [tag.sId, tag])).values()
    ).sort((a, b) => a.name.localeCompare(b.name));

    return { uniqueTags };
  }, [agentConfigurations]);

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
              {activeTab && agentsByTab[activeTab] ? (
                <AssistantsTable
                  owner={owner}
                  agents={agentsByTab[activeTab]}
                  tags={uniqueTags}
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
