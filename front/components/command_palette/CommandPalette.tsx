import { CreatePodModal } from "@app/components/assistant/conversation/CreatePodModal";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { MemberDetails } from "@app/components/assistant/details/MemberDetails";
import type {
  ActionPhaseItem,
  CommandPaletteAction,
} from "@app/components/command_palette/CommandPaletteActionPhase";
import { CommandPaletteActionPhase } from "@app/components/command_palette/CommandPaletteActionPhase";
import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import type {
  CommandPaletteFilter,
  CommandPaletteItem,
} from "@app/components/command_palette/CommandPaletteSearchPhase";
import {
  CommandPaletteSearchPhase,
  getCommandPaletteItemKey,
} from "@app/components/command_palette/CommandPaletteSearchPhase";
import { useCommandPaletteSearch } from "@app/components/command_palette/useCommandPaletteSearch";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { useFrecencySorting } from "@app/hooks/useFrerencySorting";
import { navigateToAdminSetting } from "@app/lib/admin/buildAdminSettingHref";
import { useAppRouter } from "@app/lib/platform";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getSkillBuilderRoute,
  navigateToPod,
} from "@app/lib/utils/router";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Dialog, DialogContent } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

const MAX_FREQUENT_ITEMS = 5;

interface CommandPaletteProps {
  owner: LightWorkspaceType;
  user: UserType;
}

export function CommandPalette({ owner, user }: CommandPaletteProps) {
  const { isOpen, close, initialCategory } = useCommandPalette();
  const router = useAppRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [phase, setPhase] = useState<"search" | "action">("search");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] =
    useState<CommandPaletteFilter>("All");
  const [selectedItem, setSelectedItem] = useState<ActionPhaseItem | null>(
    null
  );

  // Detail sheet state (lives outside the dialog lifecycle).
  const [agentDetailsId, setAgentDetailsId] = useState<string | null>(null);
  const [skillDetailsId, setSkillDetailsId] = useState<string | null>(null);
  const [memberDetailsId, setMemberDetailsId] = useState<string | null>(null);
  const [isCreatePodModalOpen, setIsCreatePodModalOpen] = useState(false);

  const {
    agents,
    conversations,
    members,
    pods,
    skills,
    settings,
    hasMoreAgents,
    hasMoreConversations,
    hasMoreMembers,
    hasMorePods,
    hasMoreSkills,
    hasMoreSettings,
    canSearchSettings,
    isLoading,
  } = useCommandPaletteSearch({
    owner,
    isOpen,
    searchQuery,
    currentUserId: user.sId,
  });

  const podId = useActivePodId();

  const { visitedItems, visitItem } = useFrecencySorting<CommandPaletteItem>(
    undefined,
    {
      key: getCommandPaletteItemKey,
      namespace: `command-palette-${owner.sId}`,
    }
  );
  const frequentItems = useMemo(
    () => visitedItems.slice(0, MAX_FREQUENT_ITEMS),
    [visitedItems]
  );

  // Reset state when dialog opens/closes.
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setPhase("search");
      setSelectedIndex(0);
      setSelectedItem(null);
      setSelectedCategory(initialCategory ?? "All");
    }
  }, [isOpen, initialCategory]);

  const executeAction = useCallback(
    (item: CommandPaletteItem, action: CommandPaletteAction) => {
      close();

      switch (action) {
        case "chat_with_in_pod":
          if (item.kind === "agent") {
            navigateToPod(
              (href) => {
                void router.push(href);
              },
              owner.sId,
              podId ?? "",
              "conversations",
              `agent=${item.agent.sId}`
            );
          } else if (item.kind === "member") {
            navigateToPod(
              (href) => {
                void router.push(href);
              },
              owner.sId,
              podId ?? "",
              "conversations",
              `user=${item.member.sId}`
            );
          }
          break;
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
    [close, router, owner.sId, podId]
  );

  const handleItemSelect = useCallback(
    (item: CommandPaletteItem) => {
      if (item.kind === "action") {
        close();
        switch (item.action) {
          case "new_conversation_in_pod":
            if (podId) {
              navigateToPod(
                (href) => {
                  void router.push(href);
                },
                owner.sId,
                podId,
                "conversations"
              );
            }
            break;
          case "new_conversation":
            void router.push(getConversationRoute(owner.sId, "new"));
            break;
          case "new_pod":
            setIsCreatePodModalOpen(true);
            break;
          default:
            assertNever(item.action);
        }
        return;
      }

      void visitItem(item);

      if (item.kind === "pod") {
        close();
        navigateToPod(
          (href) => {
            void router.push(href);
          },
          owner.sId,
          item.pod.sId
        );
        return;
      }
      if (item.kind === "conversation") {
        close();
        void router.push(
          getConversationRoute(owner.sId, item.conversation.sId)
        );
        return;
      }
      if (item.kind === "setting") {
        close();
        navigateToAdminSetting(
          (href) => {
            void router.push(href);
          },
          item.setting.pageHref,
          item.setting
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
    [close, executeAction, owner.sId, podId, router, visitItem]
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

  const handleEscapeKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // First Esc clears the query; a second Esc (empty query) closes the dialog.
      if (phase === "search" && searchQuery.length > 0) {
        e.preventDefault();
        setSearchQuery("");
      }
    },
    [phase, searchQuery]
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          size="xl"
          variant="command"
          trapFocusScope
          onEscapeKeyDown={handleEscapeKeyDown}
        >
          {phase === "search" ? (
            <CommandPaletteSearchPhase
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              agents={agents}
              conversations={conversations}
              members={members}
              pods={pods}
              skills={skills}
              settings={settings}
              frequentItems={frequentItems}
              activePodId={podId ?? null}
              hasMoreAgents={hasMoreAgents}
              hasMoreConversations={hasMoreConversations}
              hasMoreMembers={hasMoreMembers}
              hasMorePods={hasMorePods}
              hasMoreSkills={hasMoreSkills}
              hasMoreSettings={hasMoreSettings}
              canSearchSettings={canSearchSettings}
              selectedCategory={selectedCategory}
              onSelectedCategoryChange={setSelectedCategory}
              isLoading={isLoading}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
              onItemSelect={handleItemSelect}
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

      <CreatePodModal
        isOpen={isCreatePodModalOpen}
        onClose={() => setIsCreatePodModalOpen(false)}
        onCreated={(pod) => {
          setIsCreatePodModalOpen(false);
          navigateToPod(
            (href) => {
              void router.push(href);
            },
            owner.sId,
            pod.sId
          );
        }}
        owner={owner}
      />

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
