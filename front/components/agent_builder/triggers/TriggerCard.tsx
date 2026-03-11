import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getIcon } from "@app/components/resources/resources_icons";
import { useAuth } from "@app/lib/auth/AuthContext";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";
import { ActionCard, TimeIcon } from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import { useMemo } from "react";

function getTriggerIconComponent(trigger: AgentBuilderTriggerType) {
  switch (trigger.kind) {
    case "schedule":
      return TimeIcon;
    case "webhook":
      return getIcon(
        normalizeWebhookIcon(
          trigger.provider ? WEBHOOK_PRESETS[trigger.provider].icon : null
        )
      );
    default:
      assertNever(trigger);
  }
}

function getWebhookCardDescription({
  webhookTrigger,
  webhookSourceView,
}: {
  webhookTrigger: AgentBuilderTriggerType & { kind: "webhook" };
  webhookSourceView: WebhookSourceViewType | undefined;
}) {
  return (
    "Triggered " +
    (webhookTrigger.configuration.event
      ? "by " + webhookTrigger.configuration.event + " events"
      : "") +
    " on " +
    (webhookSourceView?.customName ?? webhookSourceView?.webhookSource.name) +
    "'s source."
  );
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
  const { isAdmin } = useAgentBuilderContext();
  const { user } = useAuth();
  const isEditor = trigger.editor === user?.id;
  const description = useMemo(() => {
    switch (trigger.kind) {
      case "schedule":
        try {
          return `Runs ${cronstrue.toString(trigger.configuration.cron)}.`;
        } catch {
          return "";
        }
      case "webhook":
        return getWebhookCardDescription({
          webhookTrigger: trigger,
          webhookSourceView,
        });
    }
  }, [trigger, webhookSourceView]);

  const resolvedIcon = webhookSourceView?.provider
    ? getIcon(
        normalizeWebhookIcon(WEBHOOK_PRESETS[webhookSourceView.provider].icon)
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
      cardContainerClassName="s-min-h-28"
      footer={
        trigger.editorName
          ? {
              label: (
                <>
                  Managed by{" "}
                  <span className="font-semibold">{trigger.editorName}</span>.
                </>
              ),
            }
          : undefined
      }
    />
  );
}
