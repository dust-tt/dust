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

interface SkillCreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillName: string;
  skillId: string;
  owner: WorkspaceType;
}

export function SkillCreatedDialog({
  open,
  onOpenChange,
  skillName,
  skillId,
  owner,
}: SkillCreatedDialogProps) {
  const { t } = useLingui();
  const conversationRoute = getConversationRoute(
    owner.sId,
    "new",
    `skill=${skillId}`
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Skill {skillName} created!</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Trans>
            You can now use {skillName}. Try it in a new conversation or keep
            editing this skill.
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
            label: t`Start conversation`,
            icon: MessageCircle01,
            href: conversationRoute,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
