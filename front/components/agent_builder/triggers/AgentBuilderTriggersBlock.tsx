import { TriggerSelectorDropdown } from "@app/components/agent_builder/triggers/TriggerSelectorDropdown";
import { EmptyCTA, Page, Spinner } from "@dust-tt/sparkle";
import React from "react";

export function AgentBuilderTriggersBlock() {
  const isTriggersLoading = false;
  const triggers: { name: string }[] = [];

  return (
    <div className="flex h-full flex-col gap-4">
      <Page.H>Triggers</Page.H>
      <div className="flex flex-col items-center justify-between sm:flex-row">
        <Page.P>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Triggers agent execution based on events.
          </span>
        </Page.P>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            {triggers.length > 0 && <TriggerSelectorDropdown />}
          </div>
        </div>
      </div>
      <div className="flex-1">
        {isTriggersLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : triggers.length > 0 ? (
          <div className="flex flex-col gap-4">
            {triggers.map((trigger, index) => (
              <div key={index} className="rounded-md border p-4">
                {trigger.name}
              </div>
            ))}
          </div>
        ) : (
          <EmptyCTA
            action={
              <div className="flex items-center gap-2">
                <TriggerSelectorDropdown />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
