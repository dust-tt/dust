import {
  Button,
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
  UserGroupIcon,
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
          icon={UserGroupIcon}
          label="Access"
          tooltip="Access & Publication Settings"
        />
      </DialogTrigger>
      <DialogContent size="xl" height="md">
        <DialogHeader>
          <DialogTitle>Access & Publication Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue="editors"
          className="flex flex-grow flex-col overflow-hidden"
        >
          <div className="flex-shrink-0 px-4">
            <TabsList className="inline-flex w-auto">
              <TabsTrigger value="editors" label="Editors" />
              <TabsTrigger value="slack" label="Slack Access" />
            </TabsList>
          </div>

          <DialogContainer>
            <TabsContent value="editors">
              <EditorsTab />
            </TabsContent>

            <TabsContent value="slack">
              <SlackTab />
            </TabsContent>
          </DialogContainer>
        </Tabs>

        <DialogFooter className="flex-shrink-0">
          <div className="flex w-full flex-col gap-2 px-2 pb-2">
            <Separator />
            <div className="mt-2 flex items-center justify-between gap-2">
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
                size="xs"
                selected={field.value === "visible"}
                onClick={() =>
                  field.onChange(
                    field.value === "visible" ? "hidden" : "visible"
                  )
                }
              />
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
