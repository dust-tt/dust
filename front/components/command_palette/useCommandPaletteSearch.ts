import {
  useConversations,
  usePodConversationsSummary,
  useSearchPodConversations,
  useSearchPrivateConversations,
} from "@app/hooks/conversations";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { useSearchPods } from "@app/hooks/useSearchPods";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useSearchSkills, useSkills } from "@app/lib/swr/skill_configurations";
import { filterAndSortAgents, subFilter } from "@app/lib/utils";
import type { AgentSearchListItemType } from "@app/types/agent_search/agent_search";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import type {
  SkillListItemType,
  SkillWithoutInstructionsAndToolsType,
} from "@app/types/assistant/skill_configuration";
import type { PodType } from "@app/types/space";
import type {
  LightUserTypeWithWorkspace,
  LightWorkspaceType,
} from "@app/types/user";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_DISPLAYED_AGENTS = 5;
const MAX_DISPLAYED_CONVERSATIONS = 5;
const MAX_DISPLAYED_MEMBERS = 5;
const MAX_DISPLAYED_PODS = 5;
const MAX_DISPLAYED_SKILLS = 5;

type CommandPaletteSkill =
  | SkillListItemType
  | SkillWithoutInstructionsAndToolsType;

type CommandPaletteAgent =
  | LightAgentConfigurationType
  | AgentSearchListItemType;

type CommandPalettePod = PodType & { isMember: boolean };

type CommandPaletteConversation = ConversationListItemType & {
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

  // Reuse the sidebar summary (SWR-cached) so empty-query pods can put starred
  // first without an extra network request.
  const { summary: podSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: !isOpen },
  });

  // Empty query: starred member pods first (sidebar summary order), then other
  // readable pods. With a query, keep name search order from search_projects.
  const { pods, hasMorePods } = useMemo(() => {
    if (trimmedQuery) {
      return {
        pods: searchablePods as CommandPalettePod[],
        hasMorePods: hasMoreSearchPods,
      };
    }

    const starredPods: CommandPalettePod[] = [];
    const starredIds = new Set<string>();
    for (const { space } of podSummary) {
      if (space.isStarred && !starredIds.has(space.sId)) {
        starredIds.add(space.sId);
        starredPods.push(space);
      }
    }

    const rest = searchablePods.filter((pod) => !starredIds.has(pod.sId));
    const merged = [...starredPods, ...rest];

    return {
      pods: merged.slice(0, MAX_DISPLAYED_PODS),
      hasMorePods: merged.length > MAX_DISPLAYED_PODS || hasMoreSearchPods,
    };
  }, [trimmedQuery, searchablePods, hasMoreSearchPods, podSummary]);

  return {
    pods,
    hasMorePods,
    isLoading: isSearchingPods,
  };
}

function useCommandPaletteMembers({
  owner,
  isOpen,
  trimmedQuery,
  currentUserId,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  trimmedQuery: string;
  currentUserId: string;
}) {
  // Same member search as People / editor pickers. Only when typing — there is
  // no sidebar "recent members" cache to reuse for an empty-query default.
  const isMemberSearchEnabled = isOpen && trimmedQuery.length > 0;
  const {
    members: searchMembers,
    totalMembersCount,
    isLoading: isSearchingMembers,
  } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: trimmedQuery,
    pageIndex: 0,
    pageSize: MAX_DISPLAYED_MEMBERS + 1,
    disabled: !isMemberSearchEnabled,
  });

  const members = useMemo(() => {
    const withoutSelf = searchMembers.filter(
      (member) => member.sId !== currentUserId
    );
    return withoutSelf.slice(
      0,
      MAX_DISPLAYED_MEMBERS
    ) as LightUserTypeWithWorkspace[];
  }, [searchMembers, currentUserId]);

  return {
    members,
    hasMoreMembers:
      totalMembersCount > MAX_DISPLAYED_MEMBERS ||
      searchMembers.filter((member) => member.sId !== currentUserId).length >
        MAX_DISPLAYED_MEMBERS,
    isLoading: isSearchingMembers,
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
  // Recent private conversations (same list as the sidebar). Shares the
  // sidebar SWR cache when open, so the empty-query default is free.
  const {
    conversations: recentConversations,
    isConversationsLoading,
    hasMore: hasMoreRecentConversations,
  } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: !isOpen },
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

  // Empty query: most recently updated private conversations (sidebar order).
  // With a query: private title search + pod semantic search, same as sidebar.
  const { conversations, hasMoreConversations } = useMemo(() => {
    if (!trimmedQuery) {
      const defaults: CommandPaletteConversation[] = recentConversations.map(
        (conversation) => ({
          ...conversation,
          spaceName: null,
        })
      );
      return {
        conversations: defaults.slice(0, MAX_DISPLAYED_CONVERSATIONS),
        hasMoreConversations:
          defaults.length > MAX_DISPLAYED_CONVERSATIONS ||
          hasMoreRecentConversations,
      };
    }

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

    return {
      conversations: merged.slice(0, MAX_DISPLAYED_CONVERSATIONS),
      hasMoreConversations:
        hasMorePrivateConversations ||
        merged.length > MAX_DISPLAYED_CONVERSATIONS,
    };
  }, [
    trimmedQuery,
    recentConversations,
    hasMoreRecentConversations,
    privateConversationResults,
    podConversationResults,
    hasMorePrivateConversations,
  ]);

  return {
    conversations,
    hasMoreConversations,
    isLoading:
      isConversationsLoading ||
      isSearchingPrivateConversations ||
      isSearchingPodConversations,
  };
}

export function useCommandPaletteSearch({
  owner,
  isOpen,
  searchQuery,
  currentUserId,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  searchQuery: string;
  currentUserId: string;
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
  const members = useCommandPaletteMembers({
    owner,
    isOpen,
    trimmedQuery,
    currentUserId,
  });

  // Empty query shows frecency suggestions in the UI instead of default lists.
  if (!trimmedQuery) {
    return {
      agents: [],
      conversations: [],
      members: [],
      pods: [],
      skills: [],
      hasMoreAgents: false,
      hasMoreConversations: false,
      hasMoreMembers: false,
      hasMorePods: false,
      hasMoreSkills: false,
      isLoading: false,
    };
  }

  return {
    agents: agents.agents,
    conversations: conversations.conversations,
    members: members.members,
    pods: pods.pods,
    skills: skills.skills,
    hasMoreAgents: agents.hasMoreAgents,
    hasMoreConversations: conversations.hasMoreConversations,
    hasMoreMembers: members.hasMoreMembers,
    hasMorePods: pods.hasMorePods,
    hasMoreSkills: skills.hasMoreSkills,
    isLoading:
      agents.isLoading ||
      skills.isLoading ||
      pods.isLoading ||
      conversations.isLoading ||
      members.isLoading ||
      isDebouncing,
  };
}
