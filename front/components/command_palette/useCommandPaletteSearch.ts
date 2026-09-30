import {
  useSearchPodConversations,
  useSearchPrivateConversations,
} from "@app/hooks/conversations";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { useSearchPods } from "@app/hooks/useSearchPods";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSearchSkills, useSkills } from "@app/lib/swr/skill_configurations";
import { filterAndSortAgents, subFilter } from "@app/lib/utils";
import type { AgentSearchListItemType } from "@app/types/agent_search/agent_search";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type {
  SkillListItemType,
  SkillWithoutInstructionsAndToolsType,
} from "@app/types/assistant/skill_configuration";
import type { PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_DISPLAYED_AGENTS = 5;
const MAX_DISPLAYED_CONVERSATIONS = 5;
const MAX_DISPLAYED_PODS = 5;
const MAX_DISPLAYED_SKILLS = 5;

type CommandPaletteSkill =
  | SkillListItemType
  | SkillWithoutInstructionsAndToolsType;

type CommandPaletteAgent =
  | LightAgentConfigurationType
  | AgentSearchListItemType;

type CommandPalettePod = PodType & { isMember: boolean };

type CommandPaletteConversation = ConversationWithoutContentType & {
  spaceName: string | null;
};

export function useCommandPaletteSearch({
  owner,
  isOpen,
  searchQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  searchQuery: string;
}) {
  const { hasFeature } = useFeatureFlags();
  const isAgentsSearchEnabled = hasFeature("new_manage_agents_page");
  const isSkillsSearchEnabled = hasFeature("skills_search");
  const trimmedQuery = searchQuery.trim();

  const {
    agentConfigurations,
    isAgentConfigurationsLoading: isListedAgentsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    disabled: !isOpen || isAgentsSearchEnabled,
  });
  const {
    agents: searchAgents,
    hasMore: hasMoreSearchAgents,
    isAgentsLoading: isSearchAgentsLoading,
  } = useSearchAgents({
    owner,
    searchTerm: trimmedQuery,
    limit: MAX_DISPLAYED_AGENTS,
    sortBy: trimmedQuery ? "relevance" : "name",
    disabled: !isOpen || !isAgentsSearchEnabled,
  });
  const isAgentsLoading = isAgentsSearchEnabled
    ? isSearchAgentsLoading
    : isListedAgentsLoading;

  const { skills, isSkillsLoading: isListedSkillsLoading } = useSkills({
    owner,
    disabled: !isOpen || isSkillsSearchEnabled,
    status: "active",
  });
  const {
    skills: searchSkills,
    hasMore: hasMoreSearchSkills,
    isSkillsLoading: isSearchSkillsLoading,
  } = useSearchSkills({
    owner,
    searchTerm: trimmedQuery,
    limit: MAX_DISPLAYED_SKILLS,
    disabled: !isOpen || !isSkillsSearchEnabled,
  });
  const isSkillsLoading = isSkillsSearchEnabled
    ? isSearchSkillsLoading
    : isListedSkillsLoading;

  // Same readable-pods search as the sidebar (member + open pods).
  const {
    pods: searchablePods,
    isSearching: isSearchingPods,
    hasMore: hasMoreSearchPods,
  } = useSearchPods({
    workspaceId: owner.sId,
    query: trimmedQuery,
    enabled: isOpen,
    limit: MAX_DISPLAYED_PODS,
  });

  // Same conversation search as the sidebar (private title + pod semantic).
  const isConversationSearchEnabled = isOpen && trimmedQuery.length > 0;
  const {
    conversations: privateConversationResults,
    isSearching: isSearchingPrivateConversations,
    hasMore: hasMorePrivateConversations,
  } = useSearchPrivateConversations({
    workspaceId: owner.sId,
    query: trimmedQuery,
    enabled: isConversationSearchEnabled,
    limit: MAX_DISPLAYED_CONVERSATIONS,
  });
  const {
    conversations: podConversationResults,
    isSearching: isSearchingPodConversations,
  } = useSearchPodConversations({
    workspaceId: owner.sId,
    query: trimmedQuery,
    enabled: isConversationSearchEnabled,
    limit: MAX_DISPLAYED_CONVERSATIONS,
  });

  // Debounce the search query to avoid expensive fuzzy filtering on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(trimmedQuery);
    }, 150);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [trimmedQuery]);

  useEffect(() => {
    if (isOpen) {
      setDebouncedQuery("");
    }
  }, [isOpen]);

  const isDebouncing = trimmedQuery !== debouncedQuery;

  const allFilteredAgents = useMemo(
    () =>
      debouncedQuery
        ? filterAndSortAgents(agentConfigurations, debouncedQuery)
        : [...agentConfigurations].sort(compareAgentsForSort),
    [agentConfigurations, debouncedQuery]
  );

  const allFilteredSkills = useMemo(() => {
    if (!debouncedQuery) {
      return skills;
    }
    const lowerQuery = debouncedQuery.toLowerCase();
    return skills.filter((s) => subFilter(lowerQuery, s.name.toLowerCase()));
  }, [skills, debouncedQuery]);

  const allConversations = useMemo(() => {
    const seen = new Set<string>();
    const merged: CommandPaletteConversation[] = [];

    for (const conversation of privateConversationResults) {
      if (!seen.has(conversation.sId)) {
        seen.add(conversation.sId);
        merged.push({ ...conversation, spaceName: null });
      }
    }

    for (const conversation of podConversationResults) {
      if (!seen.has(conversation.sId)) {
        seen.add(conversation.sId);
        merged.push(conversation);
      }
    }

    return merged;
  }, [privateConversationResults, podConversationResults]);

  const agents: CommandPaletteAgent[] = isAgentsSearchEnabled
    ? searchAgents
    : allFilteredAgents.slice(0, MAX_DISPLAYED_AGENTS);
  const conversations = allConversations.slice(0, MAX_DISPLAYED_CONVERSATIONS);
  const pods: CommandPalettePod[] = searchablePods;
  const filteredSkills: CommandPaletteSkill[] = isSkillsSearchEnabled
    ? searchSkills
    : allFilteredSkills.slice(0, MAX_DISPLAYED_SKILLS);

  return {
    agents,
    conversations,
    pods,
    skills: filteredSkills,
    hasMoreAgents: isAgentsSearchEnabled
      ? hasMoreSearchAgents
      : allFilteredAgents.length > MAX_DISPLAYED_AGENTS,
    hasMoreConversations:
      hasMorePrivateConversations ||
      allConversations.length > MAX_DISPLAYED_CONVERSATIONS,
    hasMorePods: hasMoreSearchPods,
    hasMoreSkills: isSkillsSearchEnabled
      ? hasMoreSearchSkills
      : allFilteredSkills.length > MAX_DISPLAYED_SKILLS,
    isLoading:
      isAgentsLoading ||
      isSkillsLoading ||
      isSearchingPods ||
      isSearchingPrivateConversations ||
      isSearchingPodConversations ||
      isDebouncing,
  };
}
