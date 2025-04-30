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
  UserIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantsTable } from "@app/components/assistant/AssistantsTable";
import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { TagsFilterMenu } from "@app/components/assistant/TagsFilterMenu";
import { SCOPE_INFO } from "@app/components/assistant_builder/Sharing";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type {
  LightAgentConfigurationType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";

export const AGENT_MANAGER_TABS_LEGACY = [
  {
    label: "Edited by me",
    icon: UserIcon,
    id: "current_user",
    description: "Edited or created by you.",
  },
  {
    label: "Company",
    icon: SCOPE_INFO["workspace"].icon,
    id: "workspace",
    description: SCOPE_INFO["workspace"].text,
  },
  {
    label: "Shared",
    icon: SCOPE_INFO["published"].icon,
    id: "published",
    description: SCOPE_INFO["published"].text,
  },
  {
    id: "global",
    label: "Default",
    icon: SCOPE_INFO["global"].icon,
    description: SCOPE_INFO["global"].text,
  },
  {
    label: "Searching across all agents",
    icon: MagnifyingGlassIcon,
    id: "search",
    description: "Searching across all agents",
  },
] as const;

export const AGENT_MANAGER_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  {
    id: "all_custom",
    label: "All custom agents",
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

const ALL_TABS = [...AGENT_MANAGER_TABS, ...AGENT_MANAGER_TABS_LEGACY];

export type AssistantManagerTabsType = (typeof ALL_TABS)[number]["id"];

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  hasAgentDiscovery: boolean;
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  // TODO(agent-discovery) Remove feature-flag
  const featureFlags = await getFeatureFlags(owner);
  const hasAgentDiscovery = featureFlags.includes("agent_discovery");

  if (!auth.isBuilder() && !hasAgentDiscovery) {
    return {
      notFound: true,
    };
  }

  await MCPServerViewResource.ensureAllDefaultActionsAreCreated(auth);
  const user = auth.getNonNullableUser();

  return {
    props: {
      owner,
      subscription,
      hasAgentDiscovery,
      user: user.toJSON(),
    },
  };
});

function isValidTab(
  tab: string,
  hasAgentDiscovery: boolean
): tab is AssistantManagerTabsType {
  return (hasAgentDiscovery ? AGENT_MANAGER_TABS : AGENT_MANAGER_TABS_LEGACY)
    .map((tab) => tab.id)
    .includes(tab as AssistantManagerTabsType);
}

export default function WorkspaceAssistants({
  owner,
  subscription,
  hasAgentDiscovery,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const activeTab = useMemo(() => {
    if (assistantSearch.trim() !== "") {
      return "search";
    }

    return selectedTab && isValidTab(selectedTab, hasAgentDiscovery)
      ? selectedTab
      : hasAgentDiscovery
        ? "all_custom"
        : "current_user";
  }, [assistantSearch, selectedTab, hasAgentDiscovery]);

  // only fetch the agents that are relevant to the current scope, except when
  // user searches: search across all agents
  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "manage",
    includes: ["authors", "usage", "feedbacks"],
  });

  const { agentConfigurations: archivedAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "archived",
      includes: ["usage", "feedbacks"],
      disabled: !hasAgentDiscovery || selectedTab !== "archived",
    });

  const agentsByTab = useMemo(() => {
    const allAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter((a) => {
        if (selectedTags.length === 0) {
          return true;
        }
        return a.tags.some((t) => selectedTags.includes(t.sId));
      })
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    return {
      // do not show the "all" tab while still loading all agents
      all_custom: allAgents.filter((a) => a.scope !== "global"),
      editable_by_me: allAgents.filter((a) => a.canEdit),
      global: allAgents.filter((a) => a.scope === "global"),
      archived: archivedAgentConfigurations.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      ),
      workspace: allAgents.filter((a) => a.scope === "workspace"),
      published: allAgents.filter((a) => a.scope === "published"),
      current_user: allAgents.filter((a) => a.lastAuthors?.includes("Me")),
      search: agentConfigurations
        .filter(
          (a) =>
            a.status === "active" &&
            // Filters on search query
            subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase())
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
    selectedTags,
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
    const searchTab = AGENT_MANAGER_TABS.find((tab) => tab.id === "search");
    if (!searchTab) {
      throw new Error("Unexpected: Search tab not found");
    }

    return assistantSearch.trim() !== ""
      ? [searchTab]
      : (hasAgentDiscovery
          ? AGENT_MANAGER_TABS
          : AGENT_MANAGER_TABS_LEGACY
        ).filter((tab) => tab.id !== "search");
  }, [assistantSearch, hasAgentDiscovery]);

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
          userId={user.sId}
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
                {hasAgentDiscovery && (
                  <TagsFilterMenu
                    tags={uniqueTags}
                    selectedTags={selectedTags}
                    setSelectedTags={setSelectedTags}
                    owner={owner}
                  />
                )}
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
                      onClick={() => !assistantSearch && setSelectedTab(tab.id)}
                      tooltip={
                        AGENT_MANAGER_TABS.find((t) => t.id === tab.id)
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
