import {
  Button,
  PencilSquareIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SlackLogo,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SlackChannel } from "@app/components/assistant_builder/SlackIntegration";
import { SlackAssistantDefaultManager } from "@app/components/assistant_builder/SlackIntegration";

function SlackPopoverContent({
  setSlackDrawerOpened,
}: {
  setSlackDrawerOpened: (opened: boolean) => void;
}) {
  const slackChannels = useWatch<
    AgentBuilderFormData,
    "agentSettings.slackChannels"
  >({
    name: "agentSettings.slackChannels",
  });

  return (
    <PopoverContent>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          Slack preferences
        </span>
        <span className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
          {slackChannels.length > 0 ? (
            <>
              Default agent for:{" "}
              {slackChannels.map((c) => c.slackChannelName).join(", ")}
            </>
          ) : (
            <>Select channels in which this agent replies by default.</>
          )}
        </span>
        <div className="pt-2">
          <Button
            size="xs"
            variant="outline"
            icon={PencilSquareIcon}
            label="Select channels"
            onClick={() => {
              setSlackDrawerOpened(true);
            }}
          />
        </div>
      </div>
    </PopoverContent>
  );
}

export function AgentBuilderSlackSelector() {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();

  const [slackDrawerOpened, setSlackDrawerOpened] = useState(false);

  const slackChannels = useWatch<
    AgentBuilderFormData,
    "agentSettings.slackChannels"
  >({
    name: "agentSettings.slackChannels",
  });

  const slackProvider = useWatch<
    AgentBuilderFormData,
    "agentSettings.slackProvider"
  >({
    name: "agentSettings.slackProvider",
  });

  const {
    field: { onChange },
  } = useController<AgentBuilderFormData, "agentSettings.slackChannels">({
    name: "agentSettings.slackChannels",
  });

  if (!slackProvider) {
    return null;
  }

  const slackDataSource = supportedDataSourceViews.find(
    (dsv) => dsv.dataSource.connectorProvider === slackProvider
  )?.dataSource;

  if (!slackDataSource) {
    return null;
  }

  return (
    <>
      <SlackAssistantDefaultManager
        existingSelection={slackChannels}
        owner={owner}
        onSave={(slackChannels: SlackChannel[]) => {
          onChange(slackChannels);
        }}
        assistantHandle="@Dust"
        show={slackDrawerOpened}
        slackDataSource={slackDataSource}
        onClose={() => setSlackDrawerOpened(false)}
      />

      <PopoverRoot>
        <div
          onClick={(e: React.MouseEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <PopoverTrigger>
            <Button label="Slack" icon={SlackLogo} variant="outline" />
          </PopoverTrigger>
          <SlackPopoverContent setSlackDrawerOpened={setSlackDrawerOpened} />
        </div>
      </PopoverRoot>
    </>
  );
}
