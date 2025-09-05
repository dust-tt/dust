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
  TrashIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useConversationParticipants,
  useDeleteConversation,
} from "@app/lib/swr/conversations";
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
  const router = useRouter();
  const sendNotification = useSendNotification();
  const doDelete = useDeleteConversation(owner);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);

  const { conversationParticipants } = useConversationParticipants({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
    options: { disabled: !activeConversationId },
  });

  const shareLink = `${baseUrl}/w/${owner.sId}/assistant/${activeConversationId}`;

  const onDelete = useCallback(async () => {
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

  return (
    <>
      <DeleteConversationsDialog
        isOpen={showDeleteDialog}
        type="selection"
        selectedCount={1}
        onClose={() => setShowDeleteDialog(false)}
        onDelete={() => {
          setShowDeleteDialog(false);
          void onDelete();
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            icon={MoreIcon}
            disabled={activeConversationId === null || conversation === null}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Conversation</DropdownMenuLabel>
          <DropdownMenuItem
            label="Delete"
            onClick={() => setShowDeleteDialog(true)}
            icon={TrashIcon}
          />
          <DropdownMenuLabel>Share the conversation</DropdownMenuLabel>
          <DropdownMenuItem
            label="Copy the link"
            onClick={copyConversationLink}
            icon={LinkIcon}
          />
          {conversationParticipants?.users !== undefined &&
            conversationParticipants.users.length > 0 && (
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
                        name={user.fullName || user.username}
                      />
                    }
                    disabled
                    className="!text-foreground"
                  />
                ))}
              </>
            )}

          {conversationParticipants?.agents !== undefined &&
            conversationParticipants.agents.length > 0 && (
              <>
                <DropdownMenuLabel>Agents</DropdownMenuLabel>
                {conversationParticipants?.agents.map((agent) => (
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
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
