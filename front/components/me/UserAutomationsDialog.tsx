import { UserAutomationsTable } from "@app/components/me/UserAutomationsTable";
import { UserWakeUpsTable } from "@app/components/me/UserWakeUpsTable";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

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
  const closeDialog = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The portal has no forceMount, so this subtree unmounts when the dialog
       * closes. The tables' SWR hooks need no `disabled` gating. */}
      <DialogContent size="2xl" height="xl">
        <DialogHeader>
          <DialogTitle>Automations</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Tabs defaultValue="triggers" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="triggers" label="Triggers" />
              <TabsTrigger value="wake-ups" label="Wake-Ups" />
            </TabsList>
            <TabsContent value="triggers">
              <UserAutomationsTable owner={owner} />
            </TabsContent>
            <TabsContent value="wake-ups">
              <UserWakeUpsTable owner={owner} onNavigate={closeDialog} />
            </TabsContent>
          </Tabs>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
