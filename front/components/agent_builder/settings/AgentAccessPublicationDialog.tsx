import {
  Button,
  Cog6ToothIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Separator,
  SliderToggle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useController } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { EditorsTab } from "@app/components/agent_builder/settings/EditorsTab";
import { SlackTab } from "@app/components/agent_builder/settings/SlackTab";

export function AgentAccessPublicationDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const { field } = useController<AgentBuilderFormData, "agentSettings.scope">({
    name: "agentSettings.scope",
  });

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
      <DialogContent size="xl">
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
          <div className="flex w-full flex-col gap-4">
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col justify-start">
                <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                  Publish your agent
                </span>
                <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  Make your agent visible and usable by all members of the
                  workspace.
                </span>
              </div>
              <SliderToggle
                size="sm"
                selected={field.value === "visible"}
                onClick={() =>
                  field.onChange(
                    field.value === "visible" ? "hidden" : "visible"
                  )
                }
              />
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button
                variant="outline"
                label="Close"
                onClick={() => setIsOpen(false)}
              />
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
