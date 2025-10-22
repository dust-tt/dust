import {
  Avatar,
  BellIcon,
  Card,
  CardActionButton,
  Chip,
  TimeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import { useMemo } from "react";

import type { AgentBuilderTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useUser } from "@app/lib/swr/user";
import type { TriggerKind } from "@app/types/assistant/triggers";

function getIcon(kind: TriggerKind) {
  switch (kind) {
    case "schedule":
      return (
        <TimeIcon className="h-4 w-4 text-foreground dark:text-foreground-night" />
      );
    case "webhook":
      return (
        <BellIcon className="h-4 w-4 text-foreground dark:text-foreground-night" />
      );
    default:
      return null;
  }
}
interface TriggerCardProps {
  trigger: AgentBuilderTriggerType;
  onRemove: () => void;
  onEdit?: () => void;
}

export const TriggerCard = ({
  trigger,
  onRemove,
  onEdit,
}: TriggerCardProps) => {
  const { user } = useUser();
  const isEditor = trigger.editor === user?.id;
  const description = useMemo(() => {
    try {
      if (
        trigger.kind === "schedule" &&
        trigger.configuration &&
        "cron" in trigger.configuration
      ) {
        return `Runs ${cronstrue.toString(trigger.configuration.cron)}.`;
      } else if (trigger.kind === "webhook") {
        return "Triggered by webhook.";
      }
    } catch (error) {
      // Ignore.
    }
    return "";
  }, [trigger.kind, trigger.configuration]);

  return (
    <Card
      variant="primary"
      className={"min-h-28 select-none"}
      onClick={onEdit}
      disabled={!trigger.enabled}
      action={
        isEditor && (
          <CardActionButton
            size="mini"
            icon={XMarkIcon}
            onClick={(e: Event) => {
              e.stopPropagation();
              onRemove();
            }}
          />
        )
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <Avatar visual={getIcon(trigger.kind)} size="xs" />
          <span className="truncate">{trigger.name}</span>
          {!trigger.enabled && (
            <Chip size="mini" color="rose" label="Disabled" />
          )}
        </div>
        <span className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">{description}</span>
        </span>
        {trigger.editorName && (
          <span className="mt-auto text-xs text-muted-foreground dark:text-muted-foreground-night">
            Managed by{" "}
            <span className="font-semibold">
              {trigger.editorName ?? "another user"}
            </span>
            .
          </span>
        )}
      </div>
    </Card>
  );
};
