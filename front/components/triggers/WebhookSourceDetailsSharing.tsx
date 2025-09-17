import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsSharingProps = {
  webhookSource: WebhookSourceType;
  owner: LightWorkspaceType;
};

export function WebhookSourceDetailsSharing({
  webhookSource,
  owner,
}: WebhookSourceDetailsSharingProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* TODO: Add sharing functionality */}
    </div>
  );
}