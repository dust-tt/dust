import {
  Avatar,
  Button,
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
  useConversationMenu,
  useDeleteConversation,
} from "@app/lib/swr/conversations";
import { useUser } from "@app/lib/swr/user";
import type { ConversationWithoutContentType, WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

export function ConversationMenu({
  activeConversationId,
  conversation,
  baseUrl,
  owner,
}: {
  activeConversationId: string | null;
  conversation: ConversationWithoutContentType | null;
  baseUrl: string;
  owner: WorkspaceType;
}) {
  const { user } = useUser();
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const { joinConversation, action, users, agents } = useConversationMenu({
    ownerId: owner.sId,
    conversationId: activeConversationId,
    userId: user?.sId || null,
    isMenuOpen,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState<boolean>(false);
  const [showRenameDialog, setShowRenameDialog] = useState<boolean>(false);

  const shareLink = `${baseUrl}/w/${owner.sId}/assistant/${activeConversationId}`;

  const doDelete = useDeleteConversation(owner);
  const leaveOrDelete = useCallback(async () => {
    const res = await doDelete(conversation);
    if (res) {
      void router.push(`/w/${owner.sId}/assistant/new`);
    }
  }, [conversation, doDelete, owner.sId, router]);

  const copyConversationLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink || "");
    sendNotification({ type: "success", title: "Link copied !" });
  }, [shareLink, sendNotification]);

  if (!activeConversationId) {
    return null;
  }

  const ConversationActionMenuItem = () => {
    switch (action) {
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
        currentTitle={conversation?.title || ""}
      />
      <DropdownMenu modal={false} open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
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
          <DropdownMenuLabel>Share the conversation</DropdownMenuLabel>
          <DropdownMenuItem
            label="Copy the link"
            onClick={copyConversationLink}
            icon={LinkIcon}
          />
          <>
            {users.length > 0 && (
              <>
                <DropdownMenuLabel>Participants</DropdownMenuLabel>
                {users.map((user) => (
                  <DropdownMenuItem
                    key={user.sId}
                    label={asDisplayName(user.username)}
                    icon={
                      <Avatar
                        size="xs"
                        visual={user.pictureUrl}
                        name={user.fullName || user.username}
                      />
                    }
                    disabled
                    className="!text-foreground"
                  />
                ))}
              </>
            )}
            {agents.length > 0 && (
              <>
                <DropdownMenuLabel>Agents</DropdownMenuLabel>
                {agents.map((agent) => (
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
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
