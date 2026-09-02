import { CreatePodModal } from "@app/components/assistant/conversation/CreatePodModal";
import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { EditConversationTitleDialog } from "@app/components/assistant/conversation/EditConversationTitleDialog";
import { LeaveConversationDialog } from "@app/components/assistant/conversation/LeaveConversationDialog";
import { ConfirmContext } from "@app/components/Confirm";
import {
  useBranchConversation,
  useConversation,
  useConversationParticipants,
  useConversationParticipationOptions,
  useConversationUrlAccessMode,
  useJoinConversation,
  usePodConversationsSummary,
} from "@app/hooks/conversations";
import { useDeleteConversation } from "@app/hooks/useDeleteConversation";
import { useMoveConversationOutOfPod } from "@app/hooks/useMoveConversationOutOfPod";
import { useMoveConversationToPod } from "@app/hooks/useMoveConversationToPod";
import { useSendNotification } from "@app/hooks/useNotification";
import { useURLSheet } from "@app/hooks/useURLSheet";
import config from "@app/lib/api/config";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceIcon } from "@app/lib/spaces";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { hasHealthyProviders } from "@app/lib/utils/providersHealth";
import {
  getAgentBuilderRoute,
  getConversationRoute,
  getPodRoute,
  setQueryParam,
} from "@app/lib/utils/router";
import { arePrivateConversationUrlsDefault } from "@app/lib/workspace_policies";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import {
  getConversationDisplayTitle,
  getConversationUrlAccessMode,
  isPodConversation,
} from "@app/types/assistant/conversation";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  ArrowRight,
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Edit04,
  Eye,
  EyeOff,
  GitBranch01,
  Link01,
  LinkExternal01,
  MessageCircle01,
  Plus,
  PlusCircle,
  Sidekick,
  Trash01,
  UserSquare,
  XClose,
} from "@dust-tt/sparkle";
import type React from "react";
import type { ReactElement } from "react";
import { useCallback, useContext, useRef, useState } from "react";

/**
 * Hook for handling right-click context menu with timing protection
 *
 * This hook solves the "double right-click" problem where right-clicking while
 * a menu is open would cause it to close and immediately reopen at the cursor position.
 *
 * The core issue: DropdownMenu doesn't add a backdrop to catch events, so right-clicks
 * while the menu is open still trigger our handlers. Due to React's async state updates,
 * when the menu closes, our right-click handler sees isMenuOpen as false and reopens the menu.
 */
type MenuPhase = "closed" | "open" | "closing";

export function useConversationMenu() {
  const [menuPhase, setMenuPhase] = useState<MenuPhase>("closed");
  const [menuTriggerPosition, setMenuTriggerPosition] = useState<
    { x: number; y: number } | undefined
  >();
  const ignoreNextContextMenuRef = useRef(false);

  const handleMenuPhaseChange = useCallback((phase: MenuPhase) => {
    setMenuPhase(phase);
    if (phase === "closed") {
      setMenuTriggerPosition(undefined);
    }
  }, []);

  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const shouldIgnore = ignoreNextContextMenuRef.current;
      ignoreNextContextMenuRef.current = false;

      // Prevent the menu from reopening while its closing animation is running.
      if (shouldIgnore || menuPhase !== "closed") {
        return;
      }

      // Open menu at cursor position
      setMenuTriggerPosition({ x: e.clientX, y: e.clientY });
      setMenuPhase("open");
    },
    [menuPhase]
  );

  const handleRightPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const isContextMenuGesture =
        e.button === 2 || (e.button === 0 && e.ctrlKey);
      const target = e.target;

      ignoreNextContextMenuRef.current =
        isContextMenuGesture &&
        target instanceof Node &&
        e.currentTarget.contains(target) &&
        menuPhase !== "closed";
    },
    [menuPhase]
  );

  return {
    isMenuOpen: menuPhase === "open",
    isMenuOpenOrClosing: menuPhase !== "closed",
    menuTriggerPosition,
    handleRightClick,
    handleRightPointerDown,
    handleMenuPhaseChange,
  };
}

interface ConversationMenuProps {
  activeConversationId: string | null;
  conversation?: ConversationListItemType;
  owner: WorkspaceType;
  trigger:
    | ReactElement
    | (({ isPendingAction }: { isPendingAction: boolean }) => ReactElement);
  isConversationDisplayed: boolean;
  isOpen: boolean;
  isOpenOrClosing: boolean;
  onPhaseChange: (phase: MenuPhase) => void;
  triggerPosition?: { x: number; y: number };
  displayOpenInBrowser?: boolean;
  openDetailsInNewTab?: boolean;
}

export function ConversationMenu({
  activeConversationId,
  conversation,
  owner,
  trigger,
  isConversationDisplayed,
  isOpen,
  isOpenOrClosing,
  onPhaseChange,
  triggerPosition,
  displayOpenInBrowser,
  openDetailsInNewTab,
}: ConversationMenuProps) {
  const { user, providersHealth } = useAuth();
  const confirm = useContext(ConfirmContext);

  const clientType = useClientType();
  const isMobile = useIsMobile();

  const router = useAppRouter();

  const { hasPermission } = useWorkspacePermissions();

  const canCreateAgent = hasPermission("create", "agent");
  const canTurnIntoAgent =
    !!conversation &&
    !!user &&
    canCreateAgent &&
    !isMobile &&
    clientType !== "extension";
  const sendNotification = useSendNotification();

  const { onOpenChange: onOpenChangeAgentModal } = useURLSheet("agentDetails");
  const { onOpenChange: onOpenChangeUserModal } = useURLSheet("userDetails");

  const handleSeeAgentDetails = (agentId: string) => {
    if (openDetailsInNewTab) {
      const agentDetailsUrl = getConversationRoute(
        owner.sId,
        activeConversationId,
        `agentDetails=${agentId}`,
        config.getAppUrl()
      );
      window.open(agentDetailsUrl, "_blank");
      return;
    }
    onOpenChangeAgentModal(true);
    setQueryParam(router, "agentDetails", agentId);
  };

  const handleSeeUserDetails = (userId: string) => {
    if (openDetailsInNewTab) {
      const userDetailsUrl = getConversationRoute(
        owner.sId,
        activeConversationId,
        `userDetails=${userId}`,
        config.getAppUrl()
      );
      window.open(userDetailsUrl, "_blank");
      return;
    }
    onOpenChangeUserModal(true);
    setQueryParam(router, "userDetails", userId);
  };

  const shouldWaitBeforeFetching =
    activeConversationId === null ||
    user?.sId === undefined ||
    !isOpenOrClosing;
  const { mutateConversation } = useConversation({
    conversationId: isConversationDisplayed ? activeConversationId : null,
    workspaceId: owner.sId,
    options: { disabled: !isConversationDisplayed },
  });
  const conversationParticipationOptions = useConversationParticipationOptions({
    ownerId: owner.sId,
    conversationId: activeConversationId,
    userId: user?.sId ?? null,
    disabled: shouldWaitBeforeFetching,
  });
  const { conversationParticipants } = useConversationParticipants({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
    options: {
      disabled: shouldWaitBeforeFetching,
    },
  });

  const { summary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: shouldWaitBeforeFetching },
  });

  const [podSearchText, setPodSearchText] = useState<string>("");
  const filteredPods = summary
    .map(({ space }) => space)
    .filter((space) => space.sId !== conversation?.spaceId)
    .filter((space) =>
      space.name.toLowerCase().includes(podSearchText.toLowerCase().trim())
    );

  const conversationSpaceId =
    conversation && isPodConversation(conversation)
      ? conversation.spaceId
      : null;
  const { spaceInfo: conversationSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: conversationSpaceId,
    disabled: shouldWaitBeforeFetching || !conversationSpaceId,
  });
  const isPodEditor = conversationSpaceInfo?.isEditor ?? false;
  const canMoveOutOfPod =
    conversation && isPodConversation(conversation) && isPodEditor;

  const moveConversationToPod = useMoveConversationToPod(owner);
  const moveConversationOutOfPod = useMoveConversationOutOfPod(
    owner,
    activeConversationId
  );

  const moveToPod = useCallback(
    async (pod: SpaceType) => {
      if (!conversation) {
        return;
      }
      await moveConversationToPod(conversation, pod);
    },
    [conversation, moveConversationToPod]
  );

  const joinConversation = useJoinConversation({
    ownerId: owner.sId,
    conversationId: activeConversationId,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState<boolean>(false);
  const [showRenameDialog, setShowRenameDialog] = useState<boolean>(false);
  const [isCreatePodModalOpen, setIsCreatePodModalOpen] =
    useState<boolean>(false);
  const handleConversationBranched = useCallback(() => {
    if (isConversationDisplayed) {
      void mutateConversation();
    }
  }, [isConversationDisplayed, mutateConversation]);
  const { branchConversation, isBranching } = useBranchConversation({
    owner,
    conversationId: activeConversationId,
    onConversationBranched: handleConversationBranched,
  });
  const menuTrigger =
    typeof trigger === "function"
      ? trigger({ isPendingAction: isBranching })
      : trigger;

  const conversationLink = getConversationRoute(
    owner.sId,
    activeConversationId,
    undefined,
    config.getAppUrl()
  );

  const doDelete = useDeleteConversation(owner);
  const leaveOrDelete = useCallback(
    async (forceDelete: boolean = false) => {
      const res = await doDelete(conversation, forceDelete);
      if (isConversationDisplayed && res) {
        const redirectRoute =
          conversation && isPodConversation(conversation)
            ? getPodRoute(owner.sId, conversation.spaceId)
            : getConversationRoute(owner.sId);
        void router.push(redirectRoute);
      }
    },
    [conversation, doDelete, owner.sId, router, isConversationDisplayed]
  );

  const copyConversationLink = useCallback(async () => {
    await navigator.clipboard.writeText(conversationLink ?? "");
    sendNotification({ type: "success", title: "Link copied !" });
  }, [conversationLink, sendNotification]);

  const openConversationInBrowser = () => {
    window.open(conversationLink, "_blank");
  };
  const {
    isUpdatingConversationUrlAccessMode,
    updateConversationUrlAccessMode,
  } = useConversationUrlAccessMode({
    owner,
    conversationId: activeConversationId,
  });

  if (!activeConversationId) {
    return null;
  }

  const canJoin = conversationParticipationOptions.includes("join");
  const canLeave = conversationParticipationOptions.includes("leave");
  const canDelete = conversationParticipationOptions.includes("delete");
  const isPrivateConversationUrlsByDefaultEnabled =
    arePrivateConversationUrlsDefault(owner);
  const isPodConversationWithOwnUrl =
    conversation !== undefined && isPodConversation(conversation);
  const conversationUrlAccessMode = getConversationUrlAccessMode(
    conversation?.metadata
  );
  const canMakeUrlAccessible =
    isPrivateConversationUrlsByDefaultEnabled &&
    !isPodConversationWithOwnUrl &&
    conversationUrlAccessMode !== "workspace_members";
  const canRestrictUrlAccess =
    isPrivateConversationUrlsByDefaultEnabled &&
    !isPodConversationWithOwnUrl &&
    conversationUrlAccessMode === "workspace_members";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <DeleteConversationsDialog
        isOpen={showDeleteDialog}
        type="selection"
        selectedCount={1}
        onClose={() => setShowDeleteDialog(false)}
        onDelete={() => {
          setShowDeleteDialog(false);
          void leaveOrDelete(true);
        }}
      />
      <LeaveConversationDialog
        isOpen={showLeaveDialog}
        onClose={() => setShowLeaveDialog(false)}
        onLeave={() => {
          setShowLeaveDialog(false);
          void leaveOrDelete();
        }}
      />
      <EditConversationTitleDialog
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        owner={owner}
        conversationId={activeConversationId}
        currentTitle={
          conversation ? getConversationDisplayTitle(conversation) : ""
        }
      />
      <CreatePodModal
        isOpen={isCreatePodModalOpen}
        onClose={() => setIsCreatePodModalOpen(false)}
        onCreated={async (pod) => {
          if (conversation) {
            await moveConversationToPod(conversation, pod);
          }
          void router.push(getPodRoute(owner.sId, pod.sId));
        }}
        owner={owner}
      />
      <DropdownMenu
        modal={false}
        open={isOpen}
        onOpenChange={(open) => onPhaseChange(open ? "open" : "closing")}
      >
        {triggerPosition ? (
          <>
            {menuTrigger}
            <DropdownMenuTrigger asChild>
              <div
                style={{
                  position: "fixed",
                  left: triggerPosition.x,
                  top: triggerPosition.y,
                  width: 0,
                  height: 0,
                  pointerEvents: "none",
                }}
              />
            </DropdownMenuTrigger>
          </>
        ) : (
          <DropdownMenuTrigger asChild>{menuTrigger}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          onCloseAutoFocus={() => onPhaseChange("closed")}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DropdownMenuItem
            label="Rename conversation"
            onClick={() => setShowRenameDialog(true)}
            icon={Edit04}
          />
          <DropdownMenuItem
            label="Branch conversation"
            onClick={() => {
              void branchConversation();
            }}
            icon={GitBranch01}
            disabled={isBranching}
          />
          <DropdownMenuSeparator />
          <DropdownMenuSub
            onOpenChange={(open) => {
              if (!open) {
                setPodSearchText("");
              }
            }}
          >
            <DropdownMenuSubTrigger
              icon={ArrowRight}
              label={canMoveOutOfPod ? "Move to..." : "Move to Pod"}
            />
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                collisionPadding={16}
                className="max-w-60"
                dropdownHeaders={
                  <DropdownMenuSearchbar
                    name="pod-search"
                    placeholder="Search Pods"
                    value={podSearchText}
                    onChange={setPodSearchText}
                    autoFocus
                  />
                }
              >
                <DropdownMenuItem
                  icon={Plus}
                  label="New Pod"
                  onClick={() => setIsCreatePodModalOpen(true)}
                />
                {canMoveOutOfPod && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      icon={MessageCircle01}
                      label="Personal conversations"
                      onClick={async () =>
                        moveConversationOutOfPod(conversation)
                      }
                    />
                  </>
                )}
                <DropdownMenuSeparator />
                {canMoveOutOfPod && <DropdownMenuLabel label="Pods" />}
                {filteredPods.length > 0 ? (
                  filteredPods.map((pod) => (
                    <DropdownMenuItem
                      key={pod.sId}
                      icon={getSpaceIcon(pod)}
                      label={pod.name}
                      truncateText
                      onClick={async () => moveToPod(pod)}
                    />
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-xs italic text-muted-foreground">
                    {!!podSearchText ? "No matches" : "No Pods"}
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              icon={UserSquare}
              label="Participants"
              disabled={
                !conversationParticipants?.users.length &&
                !conversationParticipants?.agents.length &&
                !canJoin
              }
            />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {canJoin && (
                  <>
                    <DropdownMenuItem
                      label="Join"
                      onClick={joinConversation}
                      icon={PlusCircle}
                    />
                    <DropdownMenuSeparator />
                  </>
                )}
                {conversationParticipants?.agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.configurationId}
                    label={agent.name}
                    onClick={() => handleSeeAgentDetails(agent.configurationId)}
                    icon={
                      <Avatar
                        size="xs"
                        visual={agent.pictureUrl}
                        name={agent.name}
                      />
                    }
                  />
                ))}
                {conversationParticipants?.users.map((user) => (
                  <DropdownMenuItem
                    key={user.sId}
                    label={user.fullName ?? user.username}
                    onClick={() => handleSeeUserDetails(user.sId)}
                    icon={
                      <Avatar
                        size="xs"
                        visual={user.pictureUrl}
                        name={user.fullName ?? user.username}
                        isRounded
                      />
                    }
                    // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
                    className="text-foreground!"
                  />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          {displayOpenInBrowser && conversationLink && (
            <DropdownMenuItem
              label="Open in a browser tab"
              onClick={openConversationInBrowser}
              icon={LinkExternal01}
            />
          )}
          {conversationLink && (
            <DropdownMenuItem
              label="Copy link"
              onClick={copyConversationLink}
              icon={Link01}
            />
          )}
          {(canMakeUrlAccessible || canRestrictUrlAccess) && (
            <DropdownMenuItem
              label={
                canRestrictUrlAccess
                  ? "Restrict URL access"
                  : "Make URL accessible"
              }
              onClick={() => {
                void updateConversationUrlAccessMode(
                  canRestrictUrlAccess
                    ? "participants_only"
                    : "workspace_members"
                );
              }}
              icon={canRestrictUrlAccess ? EyeOff : Eye}
              disabled={isUpdatingConversationUrlAccessMode}
            />
          )}
          {canTurnIntoAgent && (
            <DropdownMenuItem
              label="Convert to agent"
              icon={Sidekick}
              disabled={!hasHealthyProviders(providersHealth)}
              onClick={async () => {
                const confirmed = await confirm({
                  title: "Shrink-wrap",
                  message:
                    "This will open the agent builder and launch Sidekick on this conversation so you can turn it into an agent.",
                  validateLabel: "Continue",
                });
                if (confirmed && conversation) {
                  const route = getAgentBuilderRoute(
                    owner.sId,
                    "new",
                    `conversationId=${conversation.sId}`
                  );
                  void router.push(route);
                }
              }}
            />
          )}
          {canLeave && (
            <DropdownMenuItem
              label="Leave"
              onClick={() => setShowLeaveDialog(true)}
              icon={XClose}
            />
          )}
          {canDelete && (
            <DropdownMenuItem
              label="Delete"
              onClick={() => setShowDeleteDialog(true)}
              icon={Trash01}
              variant="warning"
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
