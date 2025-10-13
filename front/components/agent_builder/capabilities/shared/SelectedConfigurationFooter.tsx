import { Avatar, CommandLineIcon, ContentMessage } from "@dust-tt/sparkle";
import React from "react";

import type { LightAgentConfigurationType } from "@app/types";

interface DustAppInfo {
  sId: string;
  id: string;
  name: string;
  description: string;
}

interface SelectedConfigurationFooterProps {
  selectedItem:
    | { type: "dustApp"; app: DustAppInfo }
    | { type: "childAgent"; agent: LightAgentConfigurationType }
    | null;
}

export function SelectedConfigurationFooter({
  selectedItem,
}: SelectedConfigurationFooterProps) {
  if (!selectedItem) {
    return null;
  }

  if (selectedItem.type === "dustApp") {
    const { app } = selectedItem;
    return (
      <div className="flex flex-col gap-3">
        <div className="font-semibold text-foreground dark:text-foreground-night">
          Selected Dust App
        </div>
        <ContentMessage
          title={app.name}
          icon={CommandLineIcon}
          variant="primary"
          size="lg"
        >
          {app.description || "No description available"}
        </ContentMessage>
      </div>
    );
  }

  if (selectedItem.type === "childAgent") {
    const { agent } = selectedItem;
    return (
      <div className="flex flex-col gap-3">
        <div className="font-semibold text-foreground dark:text-foreground-night">
          Selected child agent
        </div>
        <ContentMessage
          title={agent.name}
          icon={
            agent.pictureUrl
              ? () => <Avatar visual={agent.pictureUrl} size="sm" />
              : undefined
          }
          variant="primary"
          size="lg"
        >
          {agent.description || "No description available"}
        </ContentMessage>
      </div>
    );
  }

  return null;
}
