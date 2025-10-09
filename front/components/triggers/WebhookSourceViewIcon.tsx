import { Icon } from "@dust-tt/sparkle";

import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import type { WebhookSourceView } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";

export const WebhookSourceViewIcon = ({
  webhookSourceView,
}: {
  webhookSourceView: WebhookSourceView;
}) => {
  const kind = webhookSourceView.webhookSource.kind;

  if (kind === "custom") {
    return getAvatarFromIcon(webhookSourceView.icon);
  }

  return <Icon visual={WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].icon} />;
};
