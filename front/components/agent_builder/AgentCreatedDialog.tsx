import { getConversationRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  MessageCircle01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
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
          <DialogTitle>
            <Trans>Agent {agentName} created!</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Trans>
            You can now use {agentName} in conversations. Start a chat or keep
            editing this agent.
          </Trans>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Keep editing`,
            variant: "outline",
            onClick: () => {
              onOpenChange(false);
            },
          }}
          rightButtonProps={{
            label: t`Start chat`,
            icon: MessageCircle01,
            href: conversationRoute,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
