import { Card, CardActionButton, TimeIcon, XMarkIcon } from "@dust-tt/sparkle";
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
  const cronDescription = useMemo(() => {
    try {
      if (trigger.configuration?.cron) {
        return `Runs ${cronstrue.toString(trigger.configuration?.cron)}.`;
      }
    } catch (error) {
      // Ignore.
    }
    return "";
  }, [trigger.configuration?.cron]);

  return (
    <Card
      variant="primary"
      className={"h-28 select-none"}
      onClick={onEdit}
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
          {getIcon(trigger.kind)}
          <span className="truncate">{trigger.name}</span>
        </div>
        <span className="text-muted-foreground dark:text-muted-foreground-night">
          {trigger.kind === "schedule" && <span>{cronDescription}</span>}
        </span>
      </div>
    </Card>
  );
};
