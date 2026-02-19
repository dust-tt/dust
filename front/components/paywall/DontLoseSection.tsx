import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type { WorkspaceType } from "@app/types/user";
import {
  ChatBubbleLeftRightIcon,
  CloudArrowLeftRightIcon,
  Icon,
  RobotIcon,
  SparklesIcon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface DontLoseSectionProps {
  owner: WorkspaceType;
}

interface DontLoseItemProps {
  icon: ComponentType;
  title: string;
  description: string;
  isLoading?: boolean;
}

function DontLoseItem({
  icon,
  title,
  description,
  isLoading,
}: DontLoseItemProps) {
  if (isLoading) {
    return (
      <div className="flex items-start gap-3">
        <div className="h-5 w-5 animate-pulse rounded bg-muted-background dark:bg-muted-background-night" />
        <div className="flex flex-col gap-1">
          <div className="h-5 w-32 animate-pulse rounded bg-muted-background dark:bg-muted-background-night" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted-background dark:bg-muted-background-night" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">
        <Icon
          visual={icon}
          size="sm"
          className="text-primary-400 dark:text-primary-400-night"
        />
      </div>
      <div className="flex flex-col">
        <span className="font-semibold text-foreground dark:text-foreground-night">
          {title}
        </span>
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </span>
      </div>
    </div>
  );
}

export function DontLoseSection({ owner }: DontLoseSectionProps) {
  // Fetch agent configurations to get count
  const {
    agentConfigurations,
    isAgentConfigurationsLoading,
    isAgentConfigurationsError,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
  });

  const agentCount = agentConfigurations.length;

  const isLoading = isAgentConfigurationsLoading && !isAgentConfigurationsError;

  // Only show agent count if 10 or more agents
  const agentTitle =
    !isAgentConfigurationsError && agentCount >= 10
      ? `Your ${agentCount} custom agents`
      : "Your custom agents";

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-foreground dark:text-foreground-night">
        Don't lose:
      </h2>
      <div className="flex flex-col gap-5">
        <DontLoseItem
          icon={RobotIcon}
          title={agentTitle}
          description="All the AI agents you've configured with your workflows"
          isLoading={isLoading}
        />
        <DontLoseItem
          icon={ChatBubbleLeftRightIcon}
          title="Your conversation history & context"
          description="Everything your agents have learned from your interactions"
          isLoading={isLoading}
        />
        <DontLoseItem
          icon={CloudArrowLeftRightIcon}
          title="Your connected company data"
          description="All your connected company data."
          isLoading={isLoading}
        />
        <DontLoseItem
          icon={SparklesIcon}
          title="Your advanced AI models access"
          description="Access to GPT-5, Claude 4.5, Gemini, and Mistral"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
