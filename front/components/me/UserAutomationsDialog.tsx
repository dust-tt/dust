import { UserAutomationsTable } from "@app/components/me/UserAutomationsTable";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

interface UserAutomationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: LightWorkspaceType;
}

export function UserAutomationsDialog({
  open,
  onOpenChange,
  owner,
}: UserAutomationsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The portal has no forceMount, so this subtree unmounts when the dialog
       * closes. The table's SWR hooks need no `disabled` gating. */}
      <DialogContent size="2xl" height="xl">
        <DialogHeader>
          <DialogTitle>Automations</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <UserAutomationsTable owner={owner} />
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
