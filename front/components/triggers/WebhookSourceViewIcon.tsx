import type { Avatar } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

import {
  getAvatarFromIcon,
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

export const WebhookSourceViewIcon = ({
  webhookSourceView,
  size = "sm",
}: {
  webhookSourceView: WebhookSourceViewType;
  size?: ComponentProps<typeof Avatar>["size"];
}) => {
  const { provider } = webhookSourceView;

  if (provider) {
    return (
      <ResourceAvatar
        icon={getIcon(WEBHOOK_PRESETS[provider].icon)}
        size={size}
      />
    );
  }

  return getAvatarFromIcon(webhookSourceView.icon, size);
};
