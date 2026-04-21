import {
  getAvatarFromIcon,
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { CLIENT_SIDE_WEBHOOK_PRESETS } from "@app/types/triggers/webhooks_client_side";
import type { Avatar } from "@dust-tt/sparkle";
import type { ComponentProps } from "react";

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
        icon={getIcon(CLIENT_SIDE_WEBHOOK_PRESETS[provider].icon)}
        size={size}
      />
    );
  }

  return getAvatarFromIcon(webhookSourceView.icon, size);
};
