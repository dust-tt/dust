import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import type {
  ActionPhaseItem,
  CommandPaletteAction,
} from "@app/components/command_palette/CommandPaletteActionPhase";
import { CommandPaletteActionPhase } from "@app/components/command_palette/CommandPaletteActionPhase";
import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { CommandPaletteSearchPhase } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import {
  useSearchPodConversations,
  useSearchPrivateConversations,
} from "@app/hooks/conversations";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { useSearchPods } from "@app/hooks/useSearchPods";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSearchSkills, useSkills } from "@app/lib/swr/skill_configurations";
import { filterAndSortAgents, subFilter } from "@app/lib/utils";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getPodRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Dialog, DialogContent } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface CommandPaletteProps {
  owner: LightWorkspaceType;
  user: UserType;
}

const MAX_DISPLAYED_AGENTS = 5;
const MAX_DISPLAYED_CONVERSATIONS = 5;
const MAX_DISPLAYED_PODS = 5;
const MAX_DISPLAYED_SKILLS = 5;

export function CommandPalette({ owner, user }: CommandPaletteProps) {
  const { isOpen, close } = useCommandPalette();
  const { hasFeature } = useFeatureFlags();
  const isAgentsSearchEnabled = hasFeature("new_manage_agents_page");
  const isSkillsSearchEnabled = hasFeature("skills_search");
  const router = useAppRouter();

  // Dialog state.
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedQuery = searchQuery.trim();
  const [phase, setPhase] = useState<"search" | "action">("search");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedItem, setSelectedItem] = useState<ActionPhaseItem | null>(
    null
  );

  // Detail sheet state (lives outside the dialog lifecycle).
  const [agentDetailsId, setAgentDetailsId] = useState<string | null>(null);
  const [skillDetailsId, setSkillDetailsId] = useState<string | null>(null);

  // Fetch agents and skills only when the palette is open.
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
    const merged: Array<
      ConversationWithoutContentType & { spaceName: string | null }
    > = [];

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

  const {
    filteredAgents,
    filteredConversations,
    filteredPods,
    filteredSkills,
    hasMoreAgents,
    hasMoreConversations,
    hasMorePods,
    hasMoreSkills,
  } = useMemo(
    () => ({
      filteredAgents: isAgentsSearchEnabled
        ? searchAgents
        : allFilteredAgents.slice(0, MAX_DISPLAYED_AGENTS),
      filteredConversations: allConversations.slice(
        0,
        MAX_DISPLAYED_CONVERSATIONS
      ),
      filteredPods: searchablePods,
      filteredSkills: isSkillsSearchEnabled
        ? searchSkills
        : allFilteredSkills.slice(0, MAX_DISPLAYED_SKILLS),
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
    }),
    [
      allConversations,
      allFilteredAgents,
      allFilteredSkills,
      hasMorePrivateConversations,
      hasMoreSearchAgents,
      hasMoreSearchPods,
      hasMoreSearchSkills,
      isAgentsSearchEnabled,
      isSkillsSearchEnabled,
      searchAgents,
      searchablePods,
      searchSkills,
    ]
  );

  const isLoading =
    isAgentsLoading ||
    isSkillsLoading ||
    isSearchingPods ||
    isSearchingPrivateConversations ||
    isSearchingPodConversations ||
    isDebouncing;

  // Reset state when dialog opens/closes.
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setDebouncedQuery("");
      setPhase("search");
      setSelectedIndex(0);
      setSelectedItem(null);
    }
  }, [isOpen]);

  const executeAction = useCallback(
    (item: CommandPaletteItem, action: CommandPaletteAction) => {
      close();

      switch (action) {
        case "chat_with":
          if (item.kind === "agent") {
            void router.push(
              getConversationRoute(owner.sId, "new", `agent=${item.agent.sId}`)
            );
          }
          break;
        case "view_details":
          if (item.kind === "agent") {
            setAgentDetailsId(item.agent.sId);
          } else if (item.kind === "skill") {
            setSkillDetailsId(item.skill.sId);
          }
          break;
        case "edit":
          if (item.kind === "agent") {
            void router.push(getAgentBuilderRoute(owner.sId, item.agent.sId));
          } else if (item.kind === "skill") {
            void router.push(getSkillBuilderRoute(owner.sId, item.skill.sId));
          }
          break;
      }
    },
    [close, router, owner.sId]
  );

  const handleItemSelect = useCallback(
    (item: CommandPaletteItem) => {
      if (item.kind === "pod") {
        close();
        void router.push(getPodRoute(owner.sId, item.pod.sId));
        return;
      }
      if (item.kind === "conversation") {
        close();
        void router.push(
          getConversationRoute(owner.sId, item.conversation.sId)
        );
        return;
      }
      // Skills without administration access have only one action (view details).
      if (item.kind === "skill" && !item.skill.canAdministrate) {
        executeAction(item, "view_details");
      } else {
        setSelectedItem(item);
        setPhase("action");
      }
    },
    [close, executeAction, owner.sId, router]
  );

  const handleBack = useCallback(() => {
    setPhase("search");
    setSelectedItem(null);
  }, []);

  const handleAction = useCallback(
    (action: CommandPaletteAction) => {
      if (selectedItem) {
        executeAction(selectedItem, action);
      }
    },
    [selectedItem, executeAction]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        close();
      }
    },
    [close]
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent size="lg" variant="command" trapFocusScope>
          {phase === "search" ? (
            <CommandPaletteSearchPhase
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              agents={filteredAgents}
              conversations={filteredConversations}
              pods={filteredPods}
              skills={filteredSkills}
              hasMoreAgents={hasMoreAgents}
              hasMoreConversations={hasMoreConversations}
              hasMorePods={hasMorePods}
              hasMoreSkills={hasMoreSkills}
              isLoading={isLoading}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
              onItemSelect={handleItemSelect}
              onClose={close}
            />
          ) : selectedItem ? (
            <CommandPaletteActionPhase
              workspaceId={owner.sId}
              item={selectedItem}
              onAction={handleAction}
              onBack={handleBack}
              onClose={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={agentDetailsId}
        onClose={() => setAgentDetailsId(null)}
      />

      <SkillDetailsSheet
        owner={owner}
        user={user}
        skillId={skillDetailsId}
        onClose={() => setSkillDetailsId(null)}
      />
    </>
  );
}
