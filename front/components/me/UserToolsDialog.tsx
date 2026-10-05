import { UserToolsTable } from "@app/components/me/UserToolsTable";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

interface UserToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: LightWorkspaceType;
}

export function UserToolsDialog({
  open,
  onOpenChange,
  owner,
}: UserToolsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The portal has no forceMount, so this subtree unmounts when the dialog
       * closes. The table's SWR hooks need no `disabled` gating. */}
      <DialogContent size="2xl" height="xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Tools</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <UserToolsTable owner={owner} />
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
