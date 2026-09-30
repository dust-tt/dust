import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { MemberDetails } from "@app/components/assistant/details/MemberDetails";
import type {
  ActionPhaseItem,
  CommandPaletteAction,
} from "@app/components/command_palette/CommandPaletteActionPhase";
import { CommandPaletteActionPhase } from "@app/components/command_palette/CommandPaletteActionPhase";
import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import type { CommandPaletteItem } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { CommandPaletteSearchPhase } from "@app/components/command_palette/CommandPaletteSearchPhase";
import { useCommandPaletteSearch } from "@app/components/command_palette/useCommandPaletteSearch";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { useAppRouter } from "@app/lib/platform";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getPodRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Dialog, DialogContent } from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

interface CommandPaletteProps {
  owner: LightWorkspaceType;
  user: UserType;
}

export function CommandPalette({ owner, user }: CommandPaletteProps) {
  const { isOpen, close } = useCommandPalette();
  const router = useAppRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [phase, setPhase] = useState<"search" | "action">("search");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedItem, setSelectedItem] = useState<ActionPhaseItem | null>(
    null
  );

  // Detail sheet state (lives outside the dialog lifecycle).
  const [agentDetailsId, setAgentDetailsId] = useState<string | null>(null);
  const [skillDetailsId, setSkillDetailsId] = useState<string | null>(null);
  const [memberDetailsId, setMemberDetailsId] = useState<string | null>(null);

  const {
    agents,
    conversations,
    members,
    pods,
    skills,
    hasMoreAgents,
    hasMoreConversations,
    hasMoreMembers,
    hasMorePods,
    hasMoreSkills,
    isLoading,
  } = useCommandPaletteSearch({
    owner,
    isOpen,
    searchQuery,
    currentUserId: user.sId,
  });

  // Reset state when dialog opens/closes.
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
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
          } else if (item.kind === "member") {
            void router.push(
              getConversationRoute(owner.sId, "new", `user=${item.member.sId}`)
            );
          }
          break;
        case "view_details":
          if (item.kind === "agent") {
            setAgentDetailsId(item.agent.sId);
          } else if (item.kind === "skill") {
            setSkillDetailsId(item.skill.sId);
          } else if (item.kind === "member") {
            setMemberDetailsId(item.member.sId);
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
              agents={agents}
              conversations={conversations}
              members={members}
              pods={pods}
              skills={skills}
              hasMoreAgents={hasMoreAgents}
              hasMoreConversations={hasMoreConversations}
              hasMoreMembers={hasMoreMembers}
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

      <MemberDetails
        owner={owner}
        userId={memberDetailsId}
        onClose={() => setMemberDetailsId(null)}
      />
    </>
  );
}
