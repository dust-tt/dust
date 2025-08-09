import {
  Button,
  Cog6ToothIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { EditorsTab } from "@app/components/agent_builder/settings/EditorsTab";
import { SlackTab } from "@app/components/agent_builder/settings/SlackTab";

interface AgentAccessPublicationDialogProps {
  trigger?: React.ReactNode;
}

export function AgentAccessPublicationDialog({
  trigger,
}: AgentAccessPublicationDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const defaultTrigger = (
    <Button
      variant="outline"
      size="sm"
      icon={Cog6ToothIcon}
      onClick={() => setIsOpen(true)}
      tooltip="Access & Publication Settings"
    />
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger || defaultTrigger}
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Access & Publication Settings</DialogTitle>
        </DialogHeader>

        <DialogContainer>
          <Tabs defaultValue="editors" className="w-full">
            <TabsList className="mb-4 inline-flex w-auto">
              <TabsTrigger value="editors" label="Editors" />
              <TabsTrigger value="slack" label="Slack Settings" />
            </TabsList>

            <TabsContent value="editors" className="mt-0">
              <EditorsTab />
            </TabsContent>

            <TabsContent value="slack" className="mt-0">
              <SlackTab />
            </TabsContent>
          </Tabs>
        </DialogContainer>

        <DialogFooter>
          <Button
            variant="outline"
            label="Close"
            onClick={() => setIsOpen(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
