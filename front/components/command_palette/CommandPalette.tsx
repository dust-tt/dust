import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import type { CommandPaletteAction } from "@app/components/command_palette/CommandPaletteActionPhase";
import { CommandPaletteActionPhase } from "@app/components/command_palette/CommandPaletteActionPhase";
import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { CommandPaletteSearchPhase } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { SkillDetailsSheetById } from "@app/components/command_palette/SkillDetailsSheetById";
import { useConversations } from "@app/hooks/conversations/useConversations";
import { useSearchPrivateConversations } from "@app/hooks/conversations/useSearchPrivateConversations";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSkills } from "@app/lib/swr/skill_configurations";
import { filterAndSortAgents, subFilter } from "@app/lib/utils";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Dialog, DialogContent } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface CommandPaletteProps {
  owner: LightWorkspaceType;
  user: UserType;
}

export function CommandPalette({ owner, user }: CommandPaletteProps) {
  const { isOpen, close } = useCommandPalette();
  const router = useAppRouter();

  // Dialog state.
  const [searchQuery, setSearchQuery] = useState("");
  const [phase, setPhase] = useState<"search" | "action">("search");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedItem, setSelectedItem] = useState<CommandPaletteItem | null>(
    null
  );

  // Detail sheet state (lives outside the dialog lifecycle).
  const [agentDetailsId, setAgentDetailsId] = useState<string | null>(null);
  const [skillDetailsId, setSkillDetailsId] = useState<string | null>(null);

  // Fetch agents and skills only when the palette is open.
  const { agentConfigurations, isAgentConfigurationsLoading } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
      disabled: !isOpen,
    });

  const { skills, isSkillsLoading } = useSkills({
    owner,
    disabled: !isOpen,
    status: "active",
  });

  // Conversation search hits the server; the hook debounces internally (300ms)
  // and skips the fetch when the query is empty.
  const MAX_DISPLAYED_CONVERSATIONS = 5;
  const {
    conversations: searchedConversations,
    isSearching: isConversationsSearching,
    hasMore: hasMoreConversations,
  } = useSearchPrivateConversations({
    workspaceId: owner.sId,
    enabled: isOpen,
    query: searchQuery,
    limit: MAX_DISPLAYED_CONVERSATIONS,
  });

  // Recent conversations shown when no query is entered.
  const { conversations: recentConversations } = useConversations({
    workspaceId: owner.sId,
    limit: MAX_DISPLAYED_CONVERSATIONS,
    disabled: !isOpen,
  });

  // Debounce the search query to avoid expensive fuzzy filtering on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, 150);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  const isDebouncing = searchQuery.trim() !== debouncedQuery;

  // Cap the number of rendered items to avoid slow DOM rendering on large workspaces.
  // This is a temporary measure until the command palette moves to Sparkle with
  // proper list virtualization (@tanstack/react-virtual).
  const MAX_DISPLAYED_AGENTS = 25;
  const MAX_DISPLAYED_SKILLS = 15;

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

  const filteredAgents = allFilteredAgents.slice(0, MAX_DISPLAYED_AGENTS);
  const filteredSkills = allFilteredSkills.slice(0, MAX_DISPLAYED_SKILLS);
  const hasMoreAgents = allFilteredAgents.length > MAX_DISPLAYED_AGENTS;
  const hasMoreSkills = allFilteredSkills.length > MAX_DISPLAYED_SKILLS;

  const filteredConversations = debouncedQuery
    ? searchedConversations
    : recentConversations.slice(0, MAX_DISPLAYED_CONVERSATIONS);

  const isLoading =
    isAgentConfigurationsLoading ||
    isSkillsLoading ||
    isDebouncing ||
    isConversationsSearching;

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
          } else if (item.kind === "conversation") {
            void router.push(
              getConversationRoute(owner.sId, item.conversation.sId)
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
      // Conversations have a single action (open), so skip the action phase.
      if (item.kind === "conversation") {
        executeAction(item, "chat_with");
        return;
      }
      // Skills without write access have only one action (view details).
      if (item.kind === "skill" && !item.skill.canWrite) {
        executeAction(item, "view_details");
      } else {
        setSelectedItem(item);
        setPhase("action");
      }
    },
    [executeAction]
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
              skills={filteredSkills}
              conversations={filteredConversations}
              hasMoreAgents={hasMoreAgents}
              hasMoreSkills={hasMoreSkills}
              hasMoreConversations={hasMoreConversations}
              isLoading={isLoading}
              isConversationsSearching={isConversationsSearching}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
              onItemSelect={handleItemSelect}
              onClose={close}
            />
          ) : selectedItem ? (
            <CommandPaletteActionPhase
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

      <SkillDetailsSheetById
        owner={owner}
        user={user}
        skillId={skillDetailsId}
        onClose={() => setSkillDetailsId(null)}
      />
    </>
  );
}
