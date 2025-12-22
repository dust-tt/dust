import {
  Avatar,
  Card,
  CardActionButton,
  TimeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import { useMemo } from "react";

import type { AgentBuilderTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getIcon } from "@app/components/resources/resources_icons";
import { useUser } from "@app/lib/swr/user";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

function getTriggerIcon(trigger: AgentBuilderTriggerType) {
  switch (trigger.kind) {
    case "schedule":
      // There's actually no dark mode here since we're in an Avatar (fixed background).
      return <TimeIcon className="h-4 w-4 text-foreground" />;
    case "webhook":
      const IconComponent = getIcon(
        normalizeWebhookIcon(
          trigger.provider ? WEBHOOK_PRESETS[trigger.provider].icon : null
        )
      );
      return <IconComponent className="h-4 w-4 text-foreground" />;
    default:
      return null;
  }
}
interface TriggerCardProps {
  trigger: AgentBuilderTriggerType;
  webhookSourceView: WebhookSourceViewType | undefined;
  onRemove: () => void;
  onEdit?: () => void;
}

export const TriggerCard = ({
  trigger,
  webhookSourceView,
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
        return (
          "Triggered " +
          (trigger.configuration.event
            ? "by " + trigger.configuration.event + " events"
            : "") +
          " on " +
          (webhookSourceView?.customName ??
            webhookSourceView?.webhookSource.name) +
          "'s source."
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return "";
    }
  }, [
    trigger.kind,
    trigger.configuration,
    webhookSourceView?.customName,
    webhookSourceView?.webhookSource.name,
  ]);

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
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              onRemove();
            }}
          />
        )
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <Avatar
            visual={
              webhookSourceView?.provider
                ? (() => {
                    const IconComponent = getIcon(
                      normalizeWebhookIcon(
                        WEBHOOK_PRESETS[webhookSourceView.provider].icon
                      )
                    );
                    return (
                      <IconComponent className="h-4 w-4 text-foreground" />
                    );
                  })()
                : getTriggerIcon(trigger)
            }
            size="xs"
          />
          <span className="truncate">{trigger.name}</span>
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
