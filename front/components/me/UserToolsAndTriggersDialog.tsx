import { UserToolsTable } from "@app/components/me/UserToolsTable";
import { UserTriggersTable } from "@app/components/me/UserTriggersTable";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Bell01,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Zap,
} from "@dust-tt/sparkle";

interface UserToolsAndTriggersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: LightWorkspaceType;
}

export function UserToolsAndTriggersDialog({
  open,
  onOpenChange,
  owner,
}: UserToolsAndTriggersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The portal has no forceMount, so this subtree unmounts when the dialog
       * closes. The tables' SWR hooks need no `disabled` gating. */}
      <DialogContent size="2xl" height="xl">
        <DialogHeader>
          <DialogTitle>Tools and Triggers</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Tabs defaultValue="tools">
            <TabsList border>
              <TabsTrigger value="tools" label="Tools" icon={Zap} />
              <TabsTrigger value="triggers" label="Triggers" icon={Bell01} />
            </TabsList>
            <TabsContent value="tools">
              <UserToolsTable owner={owner} />
            </TabsContent>
            <TabsContent value="triggers">
              <UserTriggersTable owner={owner} />
            </TabsContent>
          </Tabs>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
