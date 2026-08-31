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
  const conversationRoute = getConversationRoute(
    owner.sId,
    "new",
    `skill=${skillId}`
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skill {skillName} created!</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          You can now use {skillName}. Try it in a new conversation or keep
          editing this skill.
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
            label: "Try skill",
            icon: MessageCircle01,
            href: conversationRoute,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
