import { useMemo } from "react";

import { WebhookSourceViewForm } from "@app/components/triggers/WebhookSourceViewForm";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsInfoProps = {
  webhookSourceView: WebhookSourceViewType;
  owner: LightWorkspaceType;
};

const getEditedLabel = (webhookSourceView: WebhookSourceViewType) => {
  if (
    webhookSourceView.editedByUser === null ||
    (webhookSourceView.editedByUser.editedAt === null &&
      webhookSourceView.editedByUser.fullName === null)
  ) {
    return null;
  }
  if (webhookSourceView.editedByUser.editedAt === null) {
    return `Edited by ${webhookSourceView.editedByUser.fullName}`;
  }
  const editedAtDateString = new Date(
    webhookSourceView.editedByUser.editedAt
  ).toLocaleDateString();
  if (webhookSourceView.editedByUser.fullName === null) {
    return `Edited on ${editedAtDateString}`;
  }

  return `Edited by ${webhookSourceView.editedByUser.fullName}, ${editedAtDateString}`;
};

export function WebhookSourceDetailsInfo({
  webhookSourceView,
  owner,
}: WebhookSourceDetailsInfoProps) {
  const editedLabel = useMemo(
    () => getEditedLabel(webhookSourceView),
    [webhookSourceView]
  );

  return (
    <div className="flex flex-col gap-2">
      {editedLabel !== null && (
        <div className="flex w-full justify-end text-sm text-muted-foreground dark:text-muted-foreground-night">
          {editedLabel}
        </div>
      )}

      <WebhookSourceViewForm
        webhookSourceView={webhookSourceView}
        owner={owner}
      />
    </div>
  );
}
