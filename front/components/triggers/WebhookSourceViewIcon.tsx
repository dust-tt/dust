import type { Avatar } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

import {
  getAvatarFromIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";

export const WebhookSourceViewIcon = ({
  webhookSourceView,
  size = "sm",
}: {
  webhookSourceView: WebhookSourceViewType;
  size?: ComponentProps<typeof Avatar>["size"];
}) => {
  const kind = webhookSourceView.webhookSource.kind;

  if (kind === "custom") {
    return getAvatarFromIcon(webhookSourceView.icon, size);
  }

  return (
    <ResourceAvatar
      icon={WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].icon}
      size={size}
    />
  );
};
