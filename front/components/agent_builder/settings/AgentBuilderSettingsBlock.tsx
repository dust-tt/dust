import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Page,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { useAgentBuilderSettingsContext } from "@app/components/agent_builder/settings/AgentSettingsContext";

export function AgentBuilderSettingsBlock() {
  const { name, setName, description, setDescription } =
    useAgentBuilderSettingsContext();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          isOpen={isOpen}
          className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 hover:bg-transparent focus:outline-none"
        >
          <Page.H>Settings</Page.H>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-4 pt-4">
            <Page.P>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Configure the basic settings for your agent.
              </span>
            </Page.P>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground dark:text-foreground-night">
                  Name
                </label>
                <Input
                  placeholder="Enter agent name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground dark:text-foreground-night">
                  Description
                </label>
                <TextArea
                  placeholder="Enter agent description"
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  rows={3}
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
