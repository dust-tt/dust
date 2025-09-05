import {
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
import { useDeleteConversation } from "@app/lib/swr/conversations";
import type { ConversationWithoutContentType, WorkspaceType } from "@app/types";

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
          <Button size="sm" variant="ghost" icon={MoreIcon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Conversation</DropdownMenuLabel>
          <DropdownMenuItem
            label="Delete"
            onClick={() => setShowDeleteDialog(true)}
            icon={TrashIcon}
            variant="warning"
          />
          <DropdownMenuLabel>Share the conversation</DropdownMenuLabel>
          <DropdownMenuItem
            label="Copy the link"
            onClick={copyConversationLink}
            icon={LinkIcon}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
