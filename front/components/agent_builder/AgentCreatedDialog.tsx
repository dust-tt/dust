import {
  ChatBubbleBottomCenterTextIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

import { getConversationRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";

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
  const agentHandle = `@${agentName}`;
  const conversationQuery = `agent=${agentId}`;

  const conversationRoute = getConversationRoute(
    owner.sId,
    "new",
    conversationQuery
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agent {agentHandle} has been created!</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          You can now use {agentHandle} in conversations. Start a chat or keep
          editing this agent.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Keep editing",
            variant: "outline",
            onClick: () => {
              onOpenChange(false);
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
