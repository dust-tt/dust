import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderTriggerType } from "@app/components/agent_builder/agentBuilderFormSchema";
import { useDescribeScheduleConfig } from "@app/components/agent_builder/triggers/schedule/useDescribeScheduleConfig";
import { getIcon } from "@app/components/resources/resources_icons";
import { useAuth } from "@app/lib/auth/AuthContext";
import { CLIENT_SIDE_WEBHOOK_PRESETS } from "@app/lib/triggers/webhooks_client_side";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { ActionCard, Clock } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

function getTriggerIconComponent(trigger: AgentBuilderTriggerType) {
  switch (trigger.kind) {
    case "schedule":
      return Clock;
    case "webhook":
      return getIcon(
        normalizeWebhookIcon(
          trigger.provider
            ? CLIENT_SIDE_WEBHOOK_PRESETS[trigger.provider].icon
            : null
        )
      );
    default:
      assertNever(trigger);
  }
}

interface TriggerCardProps {
  trigger: AgentBuilderTriggerType;
  webhookSourceView: WebhookSourceViewType | undefined;
  onRemove: () => void;
  onEdit?: () => void;
}

export function TriggerCard({
  trigger,
  webhookSourceView,
  onRemove,
  onEdit,
}: TriggerCardProps) {
  const { t } = useLingui();
  const describeScheduleConfig = useDescribeScheduleConfig();
  const { isAdmin } = useAgentBuilderContext();
  const { user } = useAuth();
  const isEditor = trigger.editor === user?.id;
  const description = useMemo(() => {
    switch (trigger.kind) {
      case "schedule": {
        const schedule = describeScheduleConfig(trigger.configuration);
        return schedule ? t`Runs ${schedule}.` : "";
      }
      case "webhook": {
        const event = trigger.configuration.event;
        const sourceName =
          webhookSourceView?.customName ??
          webhookSourceView?.webhookSource.name;
        return event
          ? t`Triggered by ${event} events on ${sourceName}'s source.`
          : t`Triggered on ${sourceName}'s source.`;
      }
    }
  }, [trigger, webhookSourceView, describeScheduleConfig, t]);

  const editorName = trigger.editorName;

  const resolvedIcon = webhookSourceView?.provider
    ? getIcon(
        normalizeWebhookIcon(
          CLIENT_SIDE_WEBHOOK_PRESETS[webhookSourceView.provider].icon
        )
      )
    : getTriggerIconComponent(trigger);

  return (
    <ActionCard
      icon={resolvedIcon}
      label={trigger.name}
      description={description}
      canAdd={false}
      disabled={trigger.status !== "enabled"}
      onClick={onEdit}
      onRemove={isEditor || isAdmin ? onRemove : undefined}
      cardContainerClassName="min-h-28"
      footer={
        trigger.editorName
          ? {
              label: (
                <Trans>
                  Managed by <span className="font-semibold">{editorName}</span>
                  .
                </Trans>
              ),
            }
          : undefined
      }
    />
  );
}
