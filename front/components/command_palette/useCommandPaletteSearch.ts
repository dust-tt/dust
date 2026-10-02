import type { CommandPaletteSetting } from "@app/components/command_palette/CommandPaletteSearchPhase";
import type { SubNavigationAdminId } from "@app/components/navigation/config";
import { subNavigationAdmin } from "@app/components/navigation/config";
import {
  useSearchPodConversations,
  useSearchPrivateConversations,
} from "@app/hooks/conversations";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { useSearchPods } from "@app/hooks/useSearchPods";
import { accessibleAdminMenus } from "@app/lib/admin/accessibleAdminMenus";
import { searchAdminSettingsIndex } from "@app/lib/admin/adminSearchIndex";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useSearchSkills, useSkills } from "@app/lib/swr/skill_configurations";
import { filterAndSortAgents, subFilter } from "@app/lib/utils";
import type { AgentSearchListItemType } from "@app/types/agent_search/agent_search";
import { hasGroupManagementScope } from "@app/types/api/auth_context";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
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

const MAX_DISPLAYED_AGENTS = 3;
const MAX_DISPLAYED_CONVERSATIONS = 3;
const MAX_DISPLAYED_MEMBERS = 3;
const MAX_DISPLAYED_PODS = 3;
const MAX_DISPLAYED_SKILLS = 3;
const MAX_DISPLAYED_SETTINGS = 3;

/** Minimum characters before the command palette runs a search. */
export const MIN_COMMAND_PALETTE_SEARCH_LENGTH = 1;
/** Typeahead debounce — matches other product search fields (300ms). */
const COMMAND_PALETTE_SEARCH_DEBOUNCE_MS = 300;

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
  const searchableQuery =
    trimmedQuery.length >= MIN_COMMAND_PALETTE_SEARCH_LENGTH
      ? trimmedQuery
      : "";
  const [debouncedQuery, setDebouncedQuery] = useState(searchableQuery);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear immediately when below the minimum (or emptied) so short queries
    // never reach search hooks and reset doesn't briefly keep old results.
    if (searchableQuery === "") {
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
      setDebouncedQuery(searchableQuery);
    }, COMMAND_PALETTE_SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchableQuery]);

  return {
    debouncedQuery,
    isDebouncing: searchableQuery !== debouncedQuery,
  };
}

function useCommandPaletteAgents({
  owner,
  isOpen,
  debouncedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  debouncedQuery: string;
}) {
  const { hasFeature } = useFeatureFlags();
  const isAgentsSearchEnabled = hasFeature("new_manage_agents_page");
  const isSearchActive = isOpen && debouncedQuery.length > 0;

  const {
    agentConfigurations,
    isAgentConfigurationsLoading: isListedAgentsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    // Client-side filter fallback only — skip until there is a valid query.
    disabled: !isSearchActive || isAgentsSearchEnabled,
  });
  const {
    agents: searchAgents,
    hasMore: hasMoreSearchAgents,
    isAgentsLoading: isSearchAgentsLoading,
  } = useSearchAgents({
    owner,
    searchTerm: debouncedQuery,
    limit: MAX_DISPLAYED_AGENTS,
    sortBy: "relevance",
    disabled: !isSearchActive || !isAgentsSearchEnabled,
    keepPreviousData: false,
    debounceMs: 0,
  });

  const allFilteredAgents = useMemo(
    () =>
      isSearchActive
        ? filterAndSortAgents(agentConfigurations, debouncedQuery)
        : [],
    [agentConfigurations, debouncedQuery, isSearchActive]
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
  debouncedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  debouncedQuery: string;
}) {
  const { hasFeature } = useFeatureFlags();
  const isSkillsSearchEnabled = hasFeature("skills_search");
  const isSearchActive = isOpen && debouncedQuery.length > 0;

  const { skills, isSkillsLoading: isListedSkillsLoading } = useSkills({
    owner,
    // Client-side filter fallback only — skip until there is a valid query.
    disabled: !isSearchActive || isSkillsSearchEnabled,
    status: "active",
  });
  const {
    skills: searchSkills,
    hasMore: hasMoreSearchSkills,
    isSkillsLoading: isSearchSkillsLoading,
  } = useSearchSkills({
    owner,
    searchTerm: debouncedQuery,
    limit: MAX_DISPLAYED_SKILLS,
    disabled: !isSearchActive || !isSkillsSearchEnabled,
    keepPreviousData: false,
    debounceMs: 0,
  });

  const allFilteredSkills = useMemo(() => {
    if (!isSearchActive) {
      return [];
    }
    const lowerQuery = debouncedQuery.toLowerCase();
    return skills.filter((s) => subFilter(lowerQuery, s.name.toLowerCase()));
  }, [skills, debouncedQuery, isSearchActive]);

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
  debouncedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  debouncedQuery: string;
}) {
  const isSearchActive = isOpen && debouncedQuery.length > 0;

  // Same readable-pods search as the sidebar (member + open pods).
  const {
    pods: searchablePods,
    isSearching: isSearchingPods,
    hasMore: hasMoreSearchPods,
  } = useSearchPods({
    workspaceId: owner.sId,
    query: debouncedQuery,
    enabled: isSearchActive,
    limit: MAX_DISPLAYED_PODS,
    debounceMs: 0,
  });

  return {
    pods: isSearchActive ? (searchablePods as CommandPalettePod[]) : [],
    hasMorePods: isSearchActive ? hasMoreSearchPods : false,
    isLoading: isSearchingPods,
  };
}

function useCommandPaletteMembers({
  owner,
  isOpen,
  debouncedQuery,
  currentUserId,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  debouncedQuery: string;
  currentUserId: string;
}) {
  // Same member search as People / editor pickers.
  const isSearchActive = isOpen && debouncedQuery.length > 0;
  const {
    members: searchMembers,
    totalMembersCount,
    isLoading: isSearchingMembers,
  } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: debouncedQuery,
    pageIndex: 0,
    pageSize: MAX_DISPLAYED_MEMBERS + 1,
    disabled: !isSearchActive,
    keepPreviousData: false,
    debounceMs: 0,
  });

  const members = useMemo(() => {
    if (!isSearchActive) {
      return [];
    }
    const withoutSelf = searchMembers.filter(
      (member) => member.sId !== currentUserId
    );
    return withoutSelf.slice(
      0,
      MAX_DISPLAYED_MEMBERS
    ) as LightUserTypeWithWorkspace[];
  }, [isSearchActive, searchMembers, currentUserId]);

  return {
    members,
    hasMoreMembers:
      isSearchActive &&
      (totalMembersCount > MAX_DISPLAYED_MEMBERS ||
        searchMembers.filter((member) => member.sId !== currentUserId).length >
          MAX_DISPLAYED_MEMBERS),
    isLoading: isSearchingMembers,
  };
}

function useCommandPaletteConversations({
  owner,
  isOpen,
  debouncedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  debouncedQuery: string;
}) {
  const isSearchActive = isOpen && debouncedQuery.length > 0;

  // Same conversation search as the sidebar (private title + pod semantic).
  const {
    conversations: privateConversationResults,
    isSearching: isSearchingPrivateConversations,
    hasMore: hasMorePrivateConversations,
  } = useSearchPrivateConversations({
    workspaceId: owner.sId,
    query: debouncedQuery,
    enabled: isSearchActive,
    limit: MAX_DISPLAYED_CONVERSATIONS,
    debounceMs: 0,
  });
  const {
    conversations: podConversationResults,
    isSearching: isSearchingPodConversations,
  } = useSearchPodConversations({
    workspaceId: owner.sId,
    query: debouncedQuery,
    enabled: isSearchActive,
    limit: MAX_DISPLAYED_CONVERSATIONS,
    debounceMs: 0,
  });

  const { conversations, hasMoreConversations } = useMemo(() => {
    if (!isSearchActive) {
      return { conversations: [], hasMoreConversations: false };
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
    isSearchActive,
    privateConversationResults,
    podConversationResults,
    hasMorePrivateConversations,
  ]);

  return {
    conversations,
    hasMoreConversations,
    isLoading: isSearchingPrivateConversations || isSearchingPodConversations,
  };
}

function useCommandPaletteSettings({
  isOpen,
  debouncedQuery,
}: {
  isOpen: boolean;
  debouncedQuery: string;
}): {
  settings: CommandPaletteSetting[];
  hasMoreSettings: boolean;
  canSearchSettings: boolean;
} {
  const owner = useWorkspace();
  const {
    subscription,
    groupManagement,
    featureFlags,
    isAdmin: isAdminUser,
  } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const { hasPermission } = useWorkspacePermissions();
  const canSearchSettings = isAdminUser;
  const isSearchActive = isOpen && debouncedQuery.length > 0;

  const menusByPageId = useMemo(() => {
    if (!canSearchSettings || !isSearchActive) {
      return new Map();
    }
    const subNavigation = subNavigationAdmin({
      owner,
      currentRoute: "",
      featureFlags,
      subscription,
      hasPermission,
      hasManagedGroups:
        featureFlags.includes("group_management") &&
        hasGroupManagementScope(groupManagement?.read_usage),
    });
    return accessibleAdminMenus(subNavigation, hasFeature);
  }, [
    canSearchSettings,
    isSearchActive,
    owner,
    featureFlags,
    subscription,
    hasPermission,
    groupManagement,
    hasFeature,
  ]);

  const { settings, hasMoreSettings } = useMemo(() => {
    if (!canSearchSettings || !isSearchActive) {
      return { settings: [], hasMoreSettings: false };
    }
    const labelFor = (pageId: string) =>
      menusByPageId.get(pageId as SubNavigationAdminId)?.label ?? pageId;
    const matches = searchAdminSettingsIndex(debouncedQuery, labelFor).filter(
      (entry) => menusByPageId.has(entry.pageId)
    );
    return {
      settings: matches.slice(0, MAX_DISPLAYED_SETTINGS).flatMap((entry) => {
        const menu = menusByPageId.get(entry.pageId);
        if (!menu?.href) {
          return [];
        }
        return [
          {
            label: entry.label,
            pageLabel: menu.label,
            pageHref: menu.href,
            sectionId: entry.sectionId,
            tab: entry.tab,
          } satisfies CommandPaletteSetting,
        ];
      }),
      hasMoreSettings: matches.length > MAX_DISPLAYED_SETTINGS,
    };
  }, [canSearchSettings, isSearchActive, debouncedQuery, menusByPageId]);

  return { settings, hasMoreSettings, canSearchSettings };
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
  const isSearchActive =
    trimmedQuery.length >= MIN_COMMAND_PALETTE_SEARCH_LENGTH;

  const agents = useCommandPaletteAgents({
    owner,
    isOpen,
    debouncedQuery,
  });
  const skills = useCommandPaletteSkills({
    owner,
    isOpen,
    debouncedQuery,
  });
  const pods = useCommandPalettePods({ owner, isOpen, debouncedQuery });
  const conversations = useCommandPaletteConversations({
    owner,
    isOpen,
    debouncedQuery,
  });
  const members = useCommandPaletteMembers({
    owner,
    isOpen,
    debouncedQuery,
    currentUserId,
  });
  const settings = useCommandPaletteSettings({ isOpen, debouncedQuery });

  // Below the minimum (including empty): no search results. Empty query uses
  // frecency / default actions in the UI instead.
  if (!isSearchActive) {
    return {
      agents: [],
      conversations: [],
      members: [],
      pods: [],
      skills: [],
      settings: [],
      hasMoreAgents: false,
      hasMoreConversations: false,
      hasMoreMembers: false,
      hasMorePods: false,
      hasMoreSkills: false,
      hasMoreSettings: false,
      canSearchSettings: settings.canSearchSettings,
      isLoading: false,
    };
  }

  // Drop results while debouncing so the previous search doesn't flash.
  if (isDebouncing) {
    return {
      agents: [],
      conversations: [],
      members: [],
      pods: [],
      skills: [],
      settings: [],
      hasMoreAgents: false,
      hasMoreConversations: false,
      hasMoreMembers: false,
      hasMorePods: false,
      hasMoreSkills: false,
      hasMoreSettings: false,
      canSearchSettings: settings.canSearchSettings,
      isLoading: true,
    };
  }

  return {
    agents: agents.agents,
    conversations: conversations.conversations,
    members: members.members,
    pods: pods.pods,
    skills: skills.skills,
    settings: settings.settings,
    hasMoreAgents: agents.hasMoreAgents,
    hasMoreConversations: conversations.hasMoreConversations,
    hasMoreMembers: members.hasMoreMembers,
    hasMorePods: pods.hasMorePods,
    hasMoreSkills: skills.hasMoreSkills,
    hasMoreSettings: settings.hasMoreSettings,
    canSearchSettings: settings.canSearchSettings,
    isLoading:
      agents.isLoading ||
      skills.isLoading ||
      pods.isLoading ||
      conversations.isLoading ||
      members.isLoading,
  };
}
