import { CreatePodModal } from "@app/components/assistant/conversation/CreatePodModal";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import type {
  ActionPhaseItem,
  CommandPaletteAction,
} from "@app/components/command_palette/CommandPaletteActionPhase";
import { CommandPaletteActionPhase } from "@app/components/command_palette/CommandPaletteActionPhase";
import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { CommandPaletteSearchPhase } from "@app/components/command_palette/CommandPaletteSearchPhase";
import {
  buildCommandPaletteCommands,
  filterCommands,
  takePerGroup,
} from "@app/components/command_palette/commandPaletteCommands";
import { SkillDetailsSheetById } from "@app/components/command_palette/SkillDetailsSheetById";
import { CreateOrEditSpaceModal } from "@app/components/spaces/CreateOrEditSpaceModal";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import config from "@app/lib/api/config";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useSkills } from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
import { filterAndSortAgents, subFilter } from "@app/lib/utils";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getPodRoute,
  getSkillBuilderRoute,
  getSpaceRoute,
} from "@app/lib/utils/router";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import { isProjectType } from "@app/types/space";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
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
  const [selectedItem, setSelectedItem] = useState<ActionPhaseItem | null>(
    null
  );

  // Detail sheet and creation modal state (lives outside the dialog lifecycle).
  const [agentDetailsId, setAgentDetailsId] = useState<string | null>(null);
  const [skillDetailsId, setSkillDetailsId] = useState<string | null>(null);
  const [isCreatePodOpen, setIsCreatePodOpen] = useState(false);
  const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false);

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

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["project"],
    disabled: !isOpen,
  });

  const { subscription } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const { hasPermission } = useWorkspacePermissions();
  const { setTheme } = useTheme();
  const memberPods = useMemo(
    () => spaces.filter(isProjectType).filter((p) => p.archivedAt === null),
    [spaces]
  );

  const signOut = useCallback(() => {
    window.location.href = `${config.getApiBaseUrl()}/api/workos/logout`;
  }, []);

  const navigate = useCallback(
    (href: string) => {
      void router.push(href);
    },
    [router]
  );

  const commands = useMemo(
    () =>
      buildCommandPaletteCommands({
        owner,
        subscription,
        featureFlags,
        hasPermission,
        currentRoute: router.pathname,
        navigate,
        setTheme,
        openCreatePod: () => setIsCreatePodOpen(true),
        openCreateSpace: () => setIsCreateSpaceOpen(true),
        signOut,
      }),
    [
      owner,
      subscription,
      featureFlags,
      hasPermission,
      router.pathname,
      navigate,
      setTheme,
      signOut,
    ]
  );

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
  const MAX_DISPLAYED_AGENTS = 5;
  const MAX_DISPLAYED_PODS = 5;
  const MAX_DISPLAYED_SKILLS = 5;
  // With no query the palette shows the first couple of commands of each group,
  // so every group stays visible without burying the entity results; a query
  // lifts the cap and lets them all show.
  const MAX_COMMANDS_PER_GROUP_WITHOUT_QUERY = 3;

  const filteredCommands = useMemo(() => {
    const matching = filterCommands(commands, debouncedQuery);
    return debouncedQuery
      ? matching
      : takePerGroup(matching, MAX_COMMANDS_PER_GROUP_WITHOUT_QUERY);
  }, [commands, debouncedQuery]);

  const allFilteredAgents = useMemo(
    () =>
      debouncedQuery
        ? filterAndSortAgents(agentConfigurations, debouncedQuery)
        : [...agentConfigurations].sort(compareAgentsForSort),
    [agentConfigurations, debouncedQuery]
  );

  const allFilteredPods = useMemo(() => {
    if (!debouncedQuery) {
      return memberPods;
    }
    const lowerQuery = debouncedQuery.toLowerCase();
    return memberPods.filter((p) =>
      subFilter(lowerQuery, p.name.toLowerCase())
    );
  }, [memberPods, debouncedQuery]);

  const allFilteredSkills = useMemo(() => {
    if (!debouncedQuery) {
      return skills;
    }
    const lowerQuery = debouncedQuery.toLowerCase();
    return skills.filter((s) => subFilter(lowerQuery, s.name.toLowerCase()));
  }, [skills, debouncedQuery]);

  const {
    filteredAgents,
    filteredPods,
    filteredSkills,
    hasMoreAgents,
    hasMorePods,
    hasMoreSkills,
  } = useMemo(
    () => ({
      filteredAgents: allFilteredAgents.slice(0, MAX_DISPLAYED_AGENTS),
      filteredPods: allFilteredPods.slice(0, MAX_DISPLAYED_PODS),
      filteredSkills: allFilteredSkills.slice(0, MAX_DISPLAYED_SKILLS),
      hasMoreAgents: allFilteredAgents.length > MAX_DISPLAYED_AGENTS,
      hasMorePods: allFilteredPods.length > MAX_DISPLAYED_PODS,
      hasMoreSkills: allFilteredSkills.length > MAX_DISPLAYED_SKILLS,
    }),
    [allFilteredAgents, allFilteredPods, allFilteredSkills]
  );

  const isLoading =
    isAgentConfigurationsLoading ||
    isSkillsLoading ||
    isSpacesLoading ||
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
      // Commands and pods act immediately; they have no action phase.
      if (item.kind === "command") {
        close();
        item.command.run();
        return;
      }
      if (item.kind === "pod") {
        close();
        void router.push(getPodRoute(owner.sId, item.pod.sId));
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
              commands={filteredCommands}
              agents={filteredAgents}
              pods={filteredPods}
              skills={filteredSkills}
              hasMoreAgents={hasMoreAgents}
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

      <CreatePodModal
        isOpen={isCreatePodOpen}
        onClose={() => setIsCreatePodOpen(false)}
        onCreated={(pod) => {
          setIsCreatePodOpen(false);
          void router.push(getPodRoute(owner.sId, pod.sId));
        }}
        owner={owner}
      />

      {isCreateSpaceOpen && (
        <CreateOrEditSpaceModal
          isAdmin={isAdmin(owner)}
          isOpen={isCreateSpaceOpen}
          onClose={() => setIsCreateSpaceOpen(false)}
          onCreated={(space) => {
            setIsCreateSpaceOpen(false);
            void router.push(getSpaceRoute(owner.sId, space.sId));
          }}
          owner={owner}
          plan={subscription.plan}
        />
      )}
    </>
  );
}
