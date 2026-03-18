import { MobileOrExtensionAgentBrowser } from "@app/components/assistant/conversation/agent_browser/MobileOrExtensionAgentBrowser";
import {
  AGENTS_TABS,
  type AgentsByTab,
  ALL_TAG,
  isValidTab,
  MOST_POPULAR_TAG,
  OTHERS_TAG,
  type SortType,
} from "@app/components/assistant/conversation/agent_browser/shared";
import { WebAgentBrowser } from "@app/components/assistant/conversation/agent_browser/WebAgentBrowser";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { rankAgentsByPopularity } from "@app/components/assistant/helpers/agents";
import { useHashParam } from "@app/hooks/useHashParams";
import { usePersistedAgentBrowserSelection } from "@app/hooks/usePersistedAgentBrowserSelection";
import { useClientType } from "@app/lib/context/clientType";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  compareForFuzzySort,
  getAgentSearchString,
  subFilter,
  tagsSorter,
} from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useMemo, useState } from "react";

interface AssistantBrowserProps {
  owner: WorkspaceType;
  agentConfigurations: LightAgentConfigurationType[];
  isLoading: boolean;
  handleAgentClick: (agent: LightAgentConfigurationType) => void;
  user: UserType;
}

export function AgentBrowser({
  owner,
  agentConfigurations,
  isLoading,
  handleAgentClick,
  user,
}: AssistantBrowserProps) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [selectedTab, setSelectedTab] = useHashParam(
    "selectedTab",
    "favorites"
  );
  const [displayedAssistantId, setDisplayedAssistantId] = useState<
    string | null
  >(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortType, setSortType] = useState<SortType>("popularity");

  const clientType = useClientType();
  const isMobile = useIsMobile();

  const { selectedTagId: persistedSelectedTagId, setSelectedTagId } =
    usePersistedAgentBrowserSelection(owner.sId);

  const sortAgents = useCallback(
    (a: LightAgentConfigurationType, b: LightAgentConfigurationType) => {
      if (sortType === "popularity") {
        return (
          (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0) ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      }
      if (sortType === "updated") {
        return (
          new Date(b.versionCreatedAt ?? 0).getTime() -
            new Date(a.versionCreatedAt ?? 0).getTime() ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    },
    [sortType]
  );

  const agentsByTab: AgentsByTab = useMemo(() => {
    const allAgents: LightAgentConfigurationType[] = agentConfigurations
      .filter((a) => a.status === "active")
      .sort(sortAgents);

    return {
      // do not show the "all" tab while still loading all agents
      all: allAgents,
      favorites: allAgents.filter((a) => a.userFavorite),
      editable_by_me: allAgents.filter((a) => a.canEdit),
      most_popular: rankAgentsByPopularity(allAgents),
    };
  }, [agentConfigurations, sortAgents]);

  const { filteredAgents, filteredTags, uniqueTags, noTagsDefined } =
    useMemo(() => {
      const tags = agentConfigurations.flatMap((a) => a.tags);
      // Remove duplicate tags by unique sId
      const uniqueTags = Array.from(
        new Map(tags.map((tag) => [tag.sId, tag])).values()
      ).sort(tagsSorter);

      uniqueTags.unshift(ALL_TAG);
      uniqueTags.unshift(MOST_POPULAR_TAG);

      // Always append others at the end
      uniqueTags.push(OTHERS_TAG);

      if (assistantSearch.trim() === "") {
        return {
          filteredAgents: [],
          filteredTags: [],
          uniqueTags,
          noTagsDefined: uniqueTags.length === 3, // Only all, most popular and others
        };
      }
      const search = assistantSearch.toLowerCase().trim().replace(/^@/, "");

      const filteredAgents: LightAgentConfigurationType[] = agentConfigurations
        .filter(
          (a) =>
            a.status === "active" &&
            // Filters on search query
            subFilter(search, getAgentSearchString(a))
        )
        .sort((a, b) => {
          return (
            compareForFuzzySort(
              assistantSearch.toLowerCase(),
              getAgentSearchString(a),
              getAgentSearchString(b)
            ) ||
            (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0) ||
            compareAgentsForSort(a, b)
          );
        });

      const filteredTags =
        selectedTag === ALL_TAG.sId
          ? uniqueTags
          : uniqueTags.filter((t) => subFilter(search, t.name.toLowerCase()));

      return {
        filteredAgents,
        filteredTags,
        uniqueTags,
        noTagsDefined: uniqueTags.length === 2, // Only most popular and others
      };
    }, [agentConfigurations, assistantSearch, selectedTag]);

  // check the query string for the tab to show, the query param to look for is called "selectedTab"
  // if it's not found, show the first tab with agents
  const viewTab = useMemo(() => {
    const enabledTabs = AGENTS_TABS.filter(
      (tab) => agentsByTab[tab.id].length > 0
    );
    return selectedTab &&
      isValidTab(
        selectedTab,
        enabledTabs.map((tab) => tab.id)
      )
      ? selectedTab
      : enabledTabs[0]?.id;
  }, [selectedTab, agentsByTab]);

  // Initialize `selectedTag` from persisted selection (or default to Most popular).
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (noTagsDefined || selectedTag) {
      return;
    }

    const validTagIds = new Set(uniqueTags.map((t) => t.sId));
    const persistedValid =
      persistedSelectedTagId && validTagIds.has(persistedSelectedTagId);

    if (persistedValid) {
      setSelectedTag(persistedSelectedTagId);
    } else {
      setSelectedTag(MOST_POPULAR_TAG.sId);
    }
  }, [
    noTagsDefined,
    persistedSelectedTagId,
    uniqueTags,
    selectedTag,
    setSelectedTag,
  ]);

  // Persist selectedTag when they change (and tags exist).
  useEffect(() => {
    if (noTagsDefined) {
      return;
    }

    if (persistedSelectedTagId !== selectedTag) {
      setSelectedTagId(selectedTag);
    }
  }, [selectedTag, noTagsDefined, persistedSelectedTagId, setSelectedTagId]);

  const isMobileOrExtension = clientType === "extension" || isMobile;

  const sharedProps = {
    owner,
    isLoading,
    handleAgentClick,
    assistantSearch,
    setAssistantSearch,
    filteredTags,
    filteredAgents,
    agentsByTab,
    viewTab,
    setSelectedTab,
    uniqueTags,
    noTagsDefined,
    selectedTag,
    setSelectedTag: (tag: string) => setSelectedTag(tag),
    setDisplayedAssistantId,
  };

  return (
    <>
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={displayedAssistantId}
        onClose={() => setDisplayedAssistantId(null)}
      />
      {isMobileOrExtension ? (
        <MobileOrExtensionAgentBrowser {...sharedProps} />
      ) : (
        <WebAgentBrowser
          {...sharedProps}
          sortType={sortType}
          setSortType={setSortType}
        />
      )}
    </>
  );
}
