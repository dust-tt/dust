import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { TriggerSelectorDropdown } from "@app/components/agent_builder/triggers/TriggerSelectorDropdown";
import { LightTriggerType, TriggerKind } from "@app/types/assistant/triggers";
import {
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Spinner,
  TimeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React from "react";

const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("/static/IconBar.svg")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 14px",
  backgroundSize: "auto 60px",
  paddingTop: "90px",
};

function getIcon(kind: TriggerKind) {
  switch (kind) {
    case "schedule":
      return (
        <TimeIcon className="h-4 w-4 text-foreground dark:text-foreground-night" />
      );
    default:
      return null;
  }
}

function TriggerCard({ trigger }: { trigger: LightTriggerType }) {
  return (
    <Card
      variant="primary"
      className="h-28"
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: Event) => {
            e.stopPropagation();
            alert("Remove trigger action not implemented yet");
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          {getIcon(trigger.kind)}
          <span className="truncate">{trigger.name}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">
            {trigger.description}
          </span>
        </div>
      </div>
    </Card>
  );
}

interface AgentBuilderTriggersBlockProps {
  agentConfigurationId?: string | null;
}

export function AgentBuilderTriggersBlock({}: AgentBuilderTriggersBlockProps) {
  const { triggers, isTriggersLoading } = {
    triggers: [
      {
        name: "New Message",
        description: "Trigger when a new message is received in the channel.",
        kind: "schedule" as const,
        config: {
          cron: "0 * * * *", // Every hour
          timezone: "UTC",
        },
      },
    ],
    isTriggersLoading: false,
  };

  return (
    <AgentBuilderSectionContainer
      title="Triggers"
      description="Triggers agent execution based on events."
      headerActions={
        triggers.length > 0 ? <TriggerSelectorDropdown /> : undefined
      }
    >
      <div className="flex-1">
        {isTriggersLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : triggers.length === 0 ? (
          <EmptyCTA
            action={<TriggerSelectorDropdown />}
            className="pb-5"
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        ) : (
          <CardGrid>
            {triggers.map((trigger, index) => (
              <TriggerCard key={index} trigger={trigger} />
            ))}
          </CardGrid>
        )}
      </div>
    </AgentBuilderSectionContainer>
  );
}
