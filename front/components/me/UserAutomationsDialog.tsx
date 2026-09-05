import { UserAutomationsTable } from "@app/components/me/UserAutomationsTable";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
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
      <DialogContent size="2xl" height="xl" grow>
        <DialogHeader>
          <DialogTitle>Automations</DialogTitle>
        </DialogHeader>
        {/* Not DialogContainer: the empty state must stretch to the dialog height, which doesn't chain through its ScrollArea. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          <UserAutomationsTable owner={owner} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
