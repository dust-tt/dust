import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import {
  useSetContentWidth,
  useSetNavChildren,
} from "@app/components/sparkle/AppLayoutContext";
import { CreateTriggerSheet } from "@app/components/triggers/CreateTriggerSheet";
import { TriggersTable } from "@app/components/triggers/TriggersTable";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useWorkspaceTriggers } from "@app/lib/swr/agent_triggers";
import { subFilter } from "@app/lib/utils";
import type { WorkspaceTriggerType } from "@app/pages/api/w/[wId]/triggers";
import {
  BoltIcon,
  Button,
  MagnifyingGlassIcon,
  Page,
  PlusIcon,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TRIGGER_MANAGER_TABS = [
  {
    id: "all",
    label: "All",
    description: "All triggers in the workspace.",
  },
  {
    id: "my_triggers",
    label: "My Triggers",
    description: "Triggers you created.",
  },
  {
    id: "subscribed",
    label: "Subscribed",
    description: "Triggers you're subscribed to.",
  },
  {
    id: "search",
    label: "Search results",
    icon: MagnifyingGlassIcon,
    description: "Triggers matching your search.",
  },
] as const;

type TriggerManagerTabType = (typeof TRIGGER_MANAGER_TABS)[number]["id"];

function isValidTab(tab: string): tab is TriggerManagerTabType {
  return TRIGGER_MANAGER_TABS.some((t) => t.id === tab);
}

export function ManageTriggersPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedTab, setSelectedTab] = useHashParam("selectedTab", "all");
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  const isSearchActive = search.trim() !== "";

  const activeTab = useMemo(() => {
    if (isSearchActive) {
      return "search";
    }
    return selectedTab && isValidTab(selectedTab) ? selectedTab : "all";
  }, [isSearchActive, selectedTab]);

  // Fetch all workspace triggers.
  const {
    triggers: allTriggers,
    isTriggersLoading: isAllLoading,
    mutateTriggers,
  } = useWorkspaceTriggers({
    workspaceId: owner.sId,
    tab: "all",
  });

  const { triggers: myTriggers, isTriggersLoading: isMyLoading } =
    useWorkspaceTriggers({
      workspaceId: owner.sId,
      tab: "my_triggers",
    });

  const {
    triggers: subscribedTriggers,
    isTriggersLoading: isSubscribedLoading,
  } = useWorkspaceTriggers({
    workspaceId: owner.sId,
    tab: "subscribed",
  });

  const triggersByTab = useMemo(() => {
    const searchLower = search.toLowerCase();

    const filterBySearch = (triggers: WorkspaceTriggerType[]) =>
      triggers.filter(
        (t) =>
          subFilter(searchLower, t.name.toLowerCase()) ||
          subFilter(searchLower, (t.agentName ?? "").toLowerCase())
      );

    return {
      all: allTriggers,
      my_triggers: myTriggers,
      subscribed: subscribedTriggers,
      search: filterBySearch(allTriggers),
    };
  }, [allTriggers, myTriggers, subscribedTriggers, search]);

  const visibleTabs = useMemo(() => {
    return isSearchActive
      ? TRIGGER_MANAGER_TABS.filter((t) => t.id === "search")
      : TRIGGER_MANAGER_TABS.filter((t) => t.id !== "search");
  }, [isSearchActive]);

  const isLoading =
    (activeTab === "all" && isAllLoading) ||
    (activeTab === "my_triggers" && isMyLoading) ||
    (activeTab === "subscribed" && isSubscribedLoading) ||
    (activeTab === "search" && isAllLoading);

  const handleDeleteTrigger = useCallback(
    async (trigger: WorkspaceTriggerType) => {
      if (
        !window.confirm(
          `Are you sure you want to delete trigger "${trigger.name}"?`
        )
      ) {
        return;
      }

      const response = await clientFetch(
        `/api/w/${owner.sId}/triggers/${trigger.sId}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        void mutateTriggers();
      }
    },
    [owner.sId, mutateTriggers]
  );

  const searchBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchBarRef.current) {
      searchBarRef.current.focus();
    }
  }, []);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("wide");
  useSetNavChildren(navChildren);

  return (
    <div className="flex w-full flex-col gap-8 pb-4 pt-2 lg:pt-8">
      <Page.Header title="Manage Triggers" icon={BoltIcon} />
      <Page.Vertical gap="md" align="stretch">
        <div className="flex flex-row gap-2">
          <SearchInput
            ref={searchBarRef}
            className="flex-grow"
            name="search"
            placeholder="Search (Name, Agent)"
            value={search}
            onChange={(s: string) => setSearch(s)}
          />
          <Button
            icon={PlusIcon}
            label="Create Trigger"
            variant="primary"
            onClick={() => setIsCreateSheetOpen(true)}
          />
        </div>
        <div className="flex flex-col pt-3">
          <Tabs value={activeTab}>
            <TabsList>
              {visibleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  label={tab.label}
                  onClick={() => {
                    if (tab.id !== "search") {
                      setSelectedTab(tab.id);
                    }
                  }}
                  isCounter
                  counterValue={`${triggersByTab[tab.id].length}`}
                />
              ))}
            </TabsList>
          </Tabs>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : triggersByTab[activeTab].length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <BoltIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {activeTab === "my_triggers"
                ? "You haven't created any triggers yet."
                : activeTab === "subscribed"
                  ? "You're not subscribed to any triggers."
                  : activeTab === "search"
                    ? "No triggers match your search."
                    : "No triggers in this workspace yet."}
            </p>
          </div>
        ) : (
          <TriggersTable
            owner={owner}
            triggers={triggersByTab[activeTab]}
            onDeleteTrigger={handleDeleteTrigger}
          />
        )}
      </Page.Vertical>
      <CreateTriggerSheet
        open={isCreateSheetOpen}
        onClose={() => setIsCreateSheetOpen(false)}
        onSuccess={() => void mutateTriggers()}
      />
    </div>
  );
}
