import {
  ChatBubbleBottomCenterTextIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useEffect } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { getConversationRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

interface AgentCreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  agentId: string;
  owner: WorkspaceType;
}

export function AgentCreatedDialog({
  open,
  onOpenChange,
  agentName,
  agentId,
  owner,
}: AgentCreatedDialogProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const sendNotification = useSendNotification(true);

  useEffect(() => {
    if (isCopied) {
      sendNotification({
        type: "success",
        title: "Link copied to clipboard",
      });
    }
  }, [isCopied, sendNotification]);

  const conversationRoute = getConversationRoute(
    owner.sId,
    "new",
    `agent=${agentId}`
  );
  const shareLink = getConversationRoute(
    owner.sId,
    "new",
    `agent=${agentId}`,
    process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agent @{agentName} has been created!</DialogTitle>
          <DialogDescription>
            You can now use @{agentName} in conversations. Start a chat or share
            the link with your team.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter
          leftButtonProps={{
            label: isCopied ? "Link copied" : "Share",
            variant: "outline",
            icon: isCopied ? ClipboardCheckIcon : ClipboardIcon,
            onClick: () => {
              void copyToClipboard(shareLink);
            },
          }}
          rightButtonProps={{
            label: "Start chat",
            icon: ChatBubbleBottomCenterTextIcon,
            href: conversationRoute,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
