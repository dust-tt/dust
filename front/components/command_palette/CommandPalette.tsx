import { CreatePodModal } from "@app/components/assistant/conversation/CreatePodModal";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { MemberDetails } from "@app/components/assistant/details/MemberDetails";
import type {
  ActionPhaseItem,
  CommandPaletteAction,
} from "@app/components/command_palette/CommandPaletteActionPhase";
import { CommandPaletteActionPhase } from "@app/components/command_palette/CommandPaletteActionPhase";
import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import type {
  CommandPaletteActionOptions,
  CommandPaletteFilter,
  CommandPaletteItem,
} from "@app/components/command_palette/CommandPaletteSearchPhase";
import {
  CommandPaletteSearchPhase,
  commandPaletteItemHasActions,
  getCommandPaletteItemKey,
} from "@app/components/command_palette/CommandPaletteSearchPhase";
import { useCommandPaletteSearch } from "@app/components/command_palette/useCommandPaletteSearch";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { useActivePodId } from "@app/hooks/useActivePodId";
import { useFrecencySorting } from "@app/hooks/useFrerencySorting";
import { navigateToAdminSetting } from "@app/lib/admin/buildAdminSettingHref";
import { useAppRouter } from "@app/lib/platform";
import { useUpdateUserFavorite } from "@app/lib/swr/assistants";
import { useStarPod } from "@app/lib/swr/pods";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getSkillBuilderRoute,
  navigateToPod,
} from "@app/lib/utils/router";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Dialog, DialogContent } from "@dust-tt/sparkle";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

const MAX_FREQUENT_ITEMS = 5;

interface CommandPaletteProps {
  owner: LightWorkspaceType;
  user: UserType;
  /** Hide the Settings category and results. */
  hideSettings?: boolean;
  /** Agents get no actions phase: selecting one only starts a conversation. */
  hideAgentActions?: boolean;
  /** Skills get no actions phase: selecting one only adds it to the message. */
  hideSkillActions?: boolean;
  /** Members get no actions phase: selecting one only starts a conversation. */
  hideMemberActions?: boolean;
}

export function CommandPalette({
  owner,
  user,
  hideSettings = false,
  hideAgentActions = false,
  hideSkillActions = false,
  hideMemberActions = false,
}: CommandPaletteProps) {
  const { isOpen, close, initialCategory } = useCommandPalette();
  const router = useAppRouter();
  const { setPendingSkill } = useContext(InputBarContext);
  const actionOptions = useMemo(
    (): CommandPaletteActionOptions => ({
      hideAgentActions,
      hideSkillActions,
      hideMemberActions,
    }),
    [hideAgentActions, hideSkillActions, hideMemberActions]
  );

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
    hideSettings,
  });

  const podId = useActivePodId();

  const starPod = useStarPod({
    workspaceId: owner.sId,
    podId: selectedItem?.kind === "pod" ? selectedItem.pod.sId : null,
  });
  const { updateUserFavorite } = useUpdateUserFavorite({
    owner,
    agentConfigurationId:
      selectedItem?.kind === "agent" ? selectedItem.agent.sId : "",
  });

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
      switch (action) {
        case "use_skill":
          close();
          if (item.kind === "skill") {
            setPendingSkill(item.skill);
          }
          break;
        case "chat_with_in_pod":
          close();
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
          close();
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
          close();
          if (item.kind === "agent") {
            setAgentDetailsId(item.agent.sId);
          } else if (item.kind === "skill") {
            setSkillDetailsId(item.skill.sId);
          } else if (item.kind === "member") {
            setMemberDetailsId(item.member.sId);
          }
          break;
        case "edit":
          close();
          if (item.kind === "agent") {
            void router.push(getAgentBuilderRoute(owner.sId, item.agent.sId));
          } else if (item.kind === "skill") {
            void router.push(getSkillBuilderRoute(owner.sId, item.skill.sId));
          }
          break;
        case "go":
          close();
          if (item.kind === "pod") {
            navigateToPod(
              (href) => {
                void router.push(href);
              },
              owner.sId,
              item.pod.sId
            );
          }
          break;
        case "star":
        case "unstar":
          close();
          if (item.kind === "pod") {
            void starPod(action === "star");
          }
          break;
        case "favorite":
        case "unfavorite":
          close();
          if (item.kind === "agent") {
            void updateUserFavorite(action === "favorite");
          }
          break;
        default:
          assertNever(action);
      }
    },
    [
      close,
      router,
      owner.sId,
      podId,
      setPendingSkill,
      starPod,
      updateUserFavorite,
    ]
  );

  // Enter / row click: run the item's default action.
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

      switch (item.kind) {
        case "pod":
          close();
          navigateToPod(
            (href) => {
              void router.push(href);
            },
            owner.sId,
            item.pod.sId
          );
          break;
        case "conversation":
          close();
          void router.push(
            getConversationRoute(owner.sId, item.conversation.sId)
          );
          break;
        case "setting":
          close();
          navigateToAdminSetting(
            (href) => {
              void router.push(href);
            },
            item.setting.pageHref,
            item.setting
          );
          break;
        case "agent":
        case "member":
          executeAction(item, "chat_with");
          break;
        case "skill":
          executeAction(item, "use_skill");
          break;
        default:
          assertNever(item);
      }
    },
    [close, executeAction, owner.sId, podId, router, visitItem]
  );

  // Right arrow / row chevron: open the actions phase when the item has one.
  const handleOpenActions = useCallback(
    (item: CommandPaletteItem) => {
      if (!commandPaletteItemHasActions(item, actionOptions)) {
        return;
      }

      void visitItem(item);
      setSelectedItem(item);
      setPhase("action");
    },
    [actionOptions, visitItem]
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
      // Action phase: Esc returns to search (don't close the dialog).
      if (phase === "action") {
        e.preventDefault();
        handleBack();
        return;
      }
      // Search: first Esc clears the query; a second Esc closes the dialog.
      if (searchQuery.length > 0) {
        e.preventDefault();
        setSearchQuery("");
      }
    },
    [phase, searchQuery, handleBack]
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
              actionOptions={actionOptions}
              selectedCategory={selectedCategory}
              onSelectedCategoryChange={setSelectedCategory}
              isLoading={isLoading}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
              onItemSelect={handleItemSelect}
              onOpenActions={handleOpenActions}
            />
          ) : selectedItem ? (
            <CommandPaletteActionPhase
              workspaceId={owner.sId}
              item={selectedItem}
              onAction={handleAction}
              onBack={handleBack}
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
        showFavoriteButton
      />

      <MemberDetails
        owner={owner}
        user={user}
        userId={memberDetailsId}
        onClose={() => setMemberDetailsId(null)}
      />
    </>
  );
}
