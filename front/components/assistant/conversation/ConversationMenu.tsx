import {
  Avatar,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  LinkIcon,
  MoreIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { EditConversationTitleDialog } from "@app/components/assistant/conversation/EditConversationTitleDialog";
import { LeaveConversationDialog } from "@app/components/assistant/conversation/LeaveConversationDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useConversationParticipants,
  useConversationParticipationOption,
  useDeleteConversation,
  useJoinConversation,
} from "@app/lib/swr/conversations";
import { useUser } from "@app/lib/swr/user";
import type { ConversationWithoutContentType, WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

export function ConversationMenu({
  activeConversationId,
  conversation,
  owner,
  className,
  isConversationDisplayed,
}: {
  activeConversationId: string | null;
  conversation: ConversationWithoutContentType | null;
  owner: WorkspaceType;
  className?: string;
  isConversationDisplayed: boolean;
}) {
  const { user } = useUser();
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const shouldWaitBeforeFetching =
    activeConversationId === null || user?.sId === undefined || !isMenuOpen;
  const conversationParticipationOption = useConversationParticipationOption({
    ownerId: owner.sId,
    conversationId: activeConversationId,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    userId: user?.sId || null,
    disabled: shouldWaitBeforeFetching,
  });
  const { conversationParticipants } = useConversationParticipants({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
    options: {
      disabled: shouldWaitBeforeFetching,
    },
  });
  const joinConversation = useJoinConversation({
    ownerId: owner.sId,
    conversationId: activeConversationId,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState<boolean>(false);
  const [showRenameDialog, setShowRenameDialog] = useState<boolean>(false);

  const baseUrl = process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL;
  const shareLink =
    baseUrl !== undefined
      ? `${baseUrl}/w/${owner.sId}/assistant/${activeConversationId}`
      : undefined;

  const doDelete = useDeleteConversation(owner);
  const leaveOrDelete = useCallback(async () => {
    const res = await doDelete(conversation);
    isConversationDisplayed &&
      res &&
      void router.push(`/w/${owner.sId}/assistant/new`);
  }, [conversation, doDelete, owner.sId, router, isConversationDisplayed]);

  const copyConversationLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink ?? "");
    sendNotification({ type: "success", title: "Link copied !" });
  }, [shareLink, sendNotification]);

  if (!activeConversationId) {
    return null;
  }

  const ConversationActionMenuItem = () => {
    switch (conversationParticipationOption) {
      case "delete":
        return (
          <DropdownMenuItem
            label="Delete"
            onClick={() => setShowDeleteDialog(true)}
            icon={TrashIcon}
          />
        );
      case "leave":
        return (
          <DropdownMenuItem
            label="Leave"
            onClick={() => setShowLeaveDialog(true)}
            icon={XMarkIcon}
          />
        );
      case "join":
        return (
          <DropdownMenuItem
            label="Join"
            onClick={joinConversation}
            icon={PlusCircleIcon}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <DeleteConversationsDialog
        isOpen={showDeleteDialog}
        type="selection"
        selectedCount={1}
        onClose={() => setShowDeleteDialog(false)}
        onDelete={() => {
          setShowDeleteDialog(false);
          void leaveOrDelete();
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
        ownerId={owner.sId}
        conversationId={activeConversationId}
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        currentTitle={conversation?.title || ""}
      />
      <DropdownMenu
        modal={false}
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
      >
        <DropdownMenuTrigger asChild className={cn(className)}>
          <Button
            size="sm"
            variant="ghost"
            icon={MoreIcon}
            disabled={
              activeConversationId === null ||
              conversation === null ||
              user === null
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Conversation</DropdownMenuLabel>
          <DropdownMenuItem
            label="Rename"
            onClick={() => setShowRenameDialog(true)}
            icon={PencilSquareIcon}
          />

          <ConversationActionMenuItem />

          {shareLink && (
            <>
          <DropdownMenuLabel>Share the conversation</DropdownMenuLabel>
          <DropdownMenuItem
            label="Copy the link"
            onClick={copyConversationLink}
            icon={LinkIcon}
          />
            </>
          )}

          {conversationParticipants === undefined ? null : (
            <>
              {conversationParticipants?.users.length > 0 && (
                <>
                  <DropdownMenuLabel>Participants</DropdownMenuLabel>
                  {conversationParticipants.users.map((user) => (
                    <DropdownMenuItem
                      key={user.sId}
                      label={asDisplayName(user.username)}
                      icon={
                        <Avatar
                          size="xs"
                          visual={user.pictureUrl}
                          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                          name={user.fullName || user.username}
                        />
                      }
                      disabled
                      className="!text-foreground"
                    />
                  ))}
                </>
              )}
              {conversationParticipants.agents.length > 0 && (
                <>
                  <DropdownMenuLabel>Agents</DropdownMenuLabel>
                  {conversationParticipants.agents.map((agent) => (
                    <DropdownMenuItem
                      key={agent.configurationId}
                      label={agent.name}
                      icon={
                        <Avatar
                          size="xs"
                          visual={agent.pictureUrl}
                          name={agent.name}
                        />
                      }
                      disabled
                      className="!text-foreground"
                    />
                  ))}
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
