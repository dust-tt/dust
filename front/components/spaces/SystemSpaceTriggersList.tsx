import * as React from "react";

import { AdminTriggersList } from "@app/components/triggers/AdminTriggersList";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface SpaceActionsListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const SystemSpaceTriggersList = ({
  owner,
  isAdmin,
  space,
}: SpaceActionsListProps) => {
  const { webhookSourcesWithViews, isWebhookSourcesWithViewsLoading } =
    useWebhookSourcesWithViews({
      owner,
      disabled: !isAdmin,
    });

  if (!isAdmin) {
    return null;
  }

  return (
      <AdminTriggersList
        owner={owner}
        systemSpace={space}
        webhookSourcesWithViews={webhookSourcesWithViews}
        isWebhookSourcesWithViewsLoading={isWebhookSourcesWithViewsLoading}
      />
  );
};
