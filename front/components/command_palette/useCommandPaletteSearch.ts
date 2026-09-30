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

function useDebouncedSearchQuery(trimmedQuery: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(trimmedQuery);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear immediately when the query is emptied (dialog reset) so results
    // don't briefly stay filtered on the previous term.
    if (trimmedQuery === "") {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setDebouncedQuery("");
      return;
    }

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

  return {
    debouncedQuery,
    isDebouncing: trimmedQuery !== debouncedQuery,
  };
}

function useCommandPaletteAgents({
  owner,
  isOpen,
  trimmedQuery,
  debouncedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  trimmedQuery: string;
  debouncedQuery: string;
}) {
  const { hasFeature } = useFeatureFlags();
  const isAgentsSearchEnabled = hasFeature("new_manage_agents_page");

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

  const allFilteredAgents = useMemo(
    () =>
      debouncedQuery
        ? filterAndSortAgents(agentConfigurations, debouncedQuery)
        : [...agentConfigurations].sort(compareAgentsForSort),
    [agentConfigurations, debouncedQuery]
  );

  return {
    agents: (isAgentsSearchEnabled
      ? searchAgents
      : allFilteredAgents.slice(
          0,
          MAX_DISPLAYED_AGENTS
        )) as CommandPaletteAgent[],
    hasMoreAgents: isAgentsSearchEnabled
      ? hasMoreSearchAgents
      : allFilteredAgents.length > MAX_DISPLAYED_AGENTS,
    isLoading: isAgentsSearchEnabled
      ? isSearchAgentsLoading
      : isListedAgentsLoading,
  };
}

function useCommandPaletteSkills({
  owner,
  isOpen,
  trimmedQuery,
  debouncedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  trimmedQuery: string;
  debouncedQuery: string;
}) {
  const { hasFeature } = useFeatureFlags();
  const isSkillsSearchEnabled = hasFeature("skills_search");

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

  const allFilteredSkills = useMemo(() => {
    if (!debouncedQuery) {
      return skills;
    }
    const lowerQuery = debouncedQuery.toLowerCase();
    return skills.filter((s) => subFilter(lowerQuery, s.name.toLowerCase()));
  }, [skills, debouncedQuery]);

  return {
    skills: (isSkillsSearchEnabled
      ? searchSkills
      : allFilteredSkills.slice(
          0,
          MAX_DISPLAYED_SKILLS
        )) as CommandPaletteSkill[],
    hasMoreSkills: isSkillsSearchEnabled
      ? hasMoreSearchSkills
      : allFilteredSkills.length > MAX_DISPLAYED_SKILLS,
    isLoading: isSkillsSearchEnabled
      ? isSearchSkillsLoading
      : isListedSkillsLoading,
  };
}

function useCommandPalettePods({
  owner,
  isOpen,
  trimmedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  trimmedQuery: string;
}) {
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

  return {
    pods: searchablePods as CommandPalettePod[],
    hasMorePods: hasMoreSearchPods,
    isLoading: isSearchingPods,
  };
}

function useCommandPaletteConversations({
  owner,
  isOpen,
  trimmedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  trimmedQuery: string;
}) {
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

  return {
    conversations: allConversations.slice(0, MAX_DISPLAYED_CONVERSATIONS),
    hasMoreConversations:
      hasMorePrivateConversations ||
      allConversations.length > MAX_DISPLAYED_CONVERSATIONS,
    isLoading: isSearchingPrivateConversations || isSearchingPodConversations,
  };
}

export function useCommandPaletteSearch({
  owner,
  isOpen,
  searchQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  searchQuery: string;
}) {
  const trimmedQuery = searchQuery.trim();
  const { debouncedQuery, isDebouncing } =
    useDebouncedSearchQuery(trimmedQuery);

  const agents = useCommandPaletteAgents({
    owner,
    isOpen,
    trimmedQuery,
    debouncedQuery,
  });
  const skills = useCommandPaletteSkills({
    owner,
    isOpen,
    trimmedQuery,
    debouncedQuery,
  });
  const pods = useCommandPalettePods({ owner, isOpen, trimmedQuery });
  const conversations = useCommandPaletteConversations({
    owner,
    isOpen,
    trimmedQuery,
  });

  return {
    agents: agents.agents,
    conversations: conversations.conversations,
    pods: pods.pods,
    skills: skills.skills,
    hasMoreAgents: agents.hasMoreAgents,
    hasMoreConversations: conversations.hasMoreConversations,
    hasMorePods: pods.hasMorePods,
    hasMoreSkills: skills.hasMoreSkills,
    isLoading:
      agents.isLoading ||
      skills.isLoading ||
      pods.isLoading ||
      conversations.isLoading ||
      isDebouncing,
  };
}
