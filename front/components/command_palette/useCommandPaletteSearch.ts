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
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useSearchSkills } from "@app/lib/swr/skill_configurations";
import { hasGroupManagementScope } from "@app/types/api/auth_context";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import type { PodListItemType } from "@app/types/space";
import type {
  LightUserTypeWithWorkspace,
  LightWorkspaceType,
} from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

const MAX_DISPLAYED_AGENTS = 3;
const MAX_DISPLAYED_CONVERSATIONS = 3;
const MAX_DISPLAYED_MEMBERS = 3;
const MAX_DISPLAYED_PODS = 3;
const MAX_DISPLAYED_SKILLS = 3;
const MAX_DISPLAYED_SETTINGS = 3;

/** Minimum characters before the command palette runs a search. */
export const MIN_COMMAND_PALETTE_SEARCH_LENGTH = 1;

type CommandPalettePod = PodListItemType;

type CommandPaletteConversation = ConversationListItemType & {
  spaceName: string | null;
};

function useCommandPaletteAgents({
  owner,
  isOpen,
  trimmedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  trimmedQuery: string;
}) {
  const isSearchActive = isOpen && trimmedQuery.length > 0;
  const { agents, hasMore, isAgentsLoading } = useSearchAgents({
    owner,
    searchTerm: trimmedQuery,
    limit: MAX_DISPLAYED_AGENTS,
    sortBy: "relevance",
    disabled: !isSearchActive,
    keepPreviousData: false,
  });
  return { agents, hasMoreAgents: hasMore, isLoading: isAgentsLoading };
}

function useCommandPaletteSkills({
  owner,
  isOpen,
  trimmedQuery,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  trimmedQuery: string;
}) {
  const isSearchActive = isOpen && trimmedQuery.length > 0;
  const { skills, hasMore, isSkillsLoading } = useSearchSkills({
    owner,
    searchTerm: trimmedQuery,
    limit: MAX_DISPLAYED_SKILLS,
    disabled: !isSearchActive,
    keepPreviousData: false,
  });
  return { skills, hasMoreSkills: hasMore, isLoading: isSkillsLoading };
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
  const isSearchActive = isOpen && trimmedQuery.length > 0;

  // Same readable-pods search as the sidebar (member + open pods).
  const {
    pods: searchablePods,
    isSearching: isSearchingPods,
    hasMore: hasMoreSearchPods,
    searchQuery,
  } = useSearchPods({
    workspaceId: owner.sId,
    query: trimmedQuery,
    enabled: isSearchActive,
    limit: MAX_DISPLAYED_PODS,
  });

  const hasCurrentResults = isSearchActive && searchQuery === trimmedQuery;

  return {
    pods: hasCurrentResults ? (searchablePods as CommandPalettePod[]) : [],
    hasMorePods: hasCurrentResults ? hasMoreSearchPods : false,
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
  // Same member search as People / editor pickers.
  const isSearchActive = isOpen && trimmedQuery.length > 0;
  const {
    members: searchMembers,
    totalMembersCount,
    isLoading: isSearchingMembers,
    searchQuery,
  } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: trimmedQuery,
    pageIndex: 0,
    pageSize: MAX_DISPLAYED_MEMBERS + 1,
    disabled: !isSearchActive,
    keepPreviousData: false,
  });

  const members = useMemo(() => {
    if (!isSearchActive || searchQuery !== trimmedQuery) {
      return [];
    }
    const withoutSelf = searchMembers.filter(
      (member) => member.sId !== currentUserId
    );
    return withoutSelf.slice(
      0,
      MAX_DISPLAYED_MEMBERS
    ) as LightUserTypeWithWorkspace[];
  }, [isSearchActive, searchQuery, trimmedQuery, searchMembers, currentUserId]);

  return {
    members,
    hasMoreMembers:
      isSearchActive &&
      searchQuery === trimmedQuery &&
      (totalMembersCount > MAX_DISPLAYED_MEMBERS ||
        searchMembers.filter((member) => member.sId !== currentUserId).length >
          MAX_DISPLAYED_MEMBERS),
    isLoading:
      isSearchingMembers || (isSearchActive && searchQuery !== trimmedQuery),
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
  const isSearchActive = isOpen && trimmedQuery.length > 0;

  // Same conversation search as the sidebar (private title + pod semantic).
  const {
    conversations: privateConversationResults,
    isSearching: isSearchingPrivateConversations,
    hasMore: hasMorePrivateConversations,
    searchQuery: privateSearchQuery,
  } = useSearchPrivateConversations({
    workspaceId: owner.sId,
    query: trimmedQuery,
    enabled: isSearchActive,
    limit: MAX_DISPLAYED_CONVERSATIONS,
  });
  const {
    conversations: podConversationResults,
    isSearching: isSearchingPodConversations,
    searchQuery: podSearchQuery,
  } = useSearchPodConversations({
    workspaceId: owner.sId,
    query: trimmedQuery,
    enabled: isSearchActive,
    limit: MAX_DISPLAYED_CONVERSATIONS,
  });

  const { conversations, hasMoreConversations } = useMemo(() => {
    if (
      !isSearchActive ||
      privateSearchQuery !== trimmedQuery ||
      podSearchQuery !== trimmedQuery
    ) {
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
    trimmedQuery,
    privateSearchQuery,
    podSearchQuery,
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
  trimmedQuery,
  hideSettings,
}: {
  isOpen: boolean;
  trimmedQuery: string;
  hideSettings: boolean;
}): {
  settings: CommandPaletteSetting[];
  hasMoreSettings: boolean;
  canSearchSettings: boolean;
} {
  const { t } = useLingui();
  const owner = useWorkspace();
  const {
    subscription,
    groupManagement,
    featureFlags,
    isAdmin: isAdminUser,
  } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const { hasPermission } = useWorkspacePermissions();
  const canSearchSettings = isAdminUser && !hideSettings;
  const isSearchActive = isOpen && trimmedQuery.length > 0;

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
      hasManagedGroups: hasGroupManagementScope(groupManagement?.read_usage),
      t,
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
    t,
  ]);

  const { settings, hasMoreSettings } = useMemo(() => {
    if (!canSearchSettings || !isSearchActive) {
      return { settings: [], hasMoreSettings: false };
    }
    const labelFor = (pageId: string) =>
      menusByPageId.get(pageId as SubNavigationAdminId)?.label ?? pageId;
    const matches = searchAdminSettingsIndex(trimmedQuery, labelFor, t).filter(
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
            label: t(entry.label),
            pageLabel: menu.label,
            pageHref: menu.href,
            sectionId: entry.sectionId,
            tab: entry.tab,
          } satisfies CommandPaletteSetting,
        ];
      }),
      hasMoreSettings: matches.length > MAX_DISPLAYED_SETTINGS,
    };
  }, [canSearchSettings, isSearchActive, trimmedQuery, menusByPageId, t]);

  return { settings, hasMoreSettings, canSearchSettings };
}

/**
 * @cc [owner:aubin-tchoi,label:product] current-query-results
 * Pods, conversations, and members from a previous search query MUST NOT be exposed
 * as selectable results while the current trimmed query is debouncing.
 */
export function useCommandPaletteSearch({
  owner,
  isOpen,
  searchQuery,
  currentUserId,
  hideSettings,
}: {
  owner: LightWorkspaceType;
  isOpen: boolean;
  searchQuery: string;
  currentUserId: string;
  hideSettings: boolean;
}) {
  const trimmedQuery = searchQuery.trim();
  const isSearchActive =
    trimmedQuery.length >= MIN_COMMAND_PALETTE_SEARCH_LENGTH;

  const agents = useCommandPaletteAgents({
    owner,
    isOpen,
    trimmedQuery,
  });
  const skills = useCommandPaletteSkills({
    owner,
    isOpen,
    trimmedQuery,
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
  const settings = useCommandPaletteSettings({
    isOpen,
    trimmedQuery,
    hideSettings,
  });

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
