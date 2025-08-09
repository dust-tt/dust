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
import { DialogTrigger } from "@dust-tt/sparkle";
import React, { useState } from "react";

import { EditorsTab } from "@app/components/agent_builder/settings/EditorsTab";
import { SlackTab } from "@app/components/agent_builder/settings/SlackTab";

export function AgentAccessPublicationDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={Cog6ToothIcon}
          tooltip="Access & Publication Settings"
        />
      </DialogTrigger>
      <DialogContent size="xl" height="xl">
        <DialogContainer>
          <DialogHeader>
            <DialogTitle>Access & Publication Settings</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="editors" className="w-full">
            <TabsList className="mb-4 inline-flex w-auto">
              <TabsTrigger value="editors" label="Editors" />
              <TabsTrigger value="slack" label="Slack Settings" />
            </TabsList>

            <TabsContent value="editors">
              <EditorsTab />
            </TabsContent>

            <TabsContent value="slack">
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
