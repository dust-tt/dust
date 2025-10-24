import { useEffect } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";

export function CreateWebhookZendeskConnection({
  connectionId,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
}: WebhookCreateFormComponentProps) {
  // Notify parent component that we're ready to submit
  // The connection is already established by the parent component and there is nothing else to do
  useEffect(() => {
    if (onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange({
        connectionId,
        remoteMetadata: {},
      });
    }

    if (onReadyToSubmitChange) {
      onReadyToSubmitChange(true);
    }
  }, [connectionId, onDataToCreateWebhookChange, onReadyToSubmitChange]);
  return null;
}
