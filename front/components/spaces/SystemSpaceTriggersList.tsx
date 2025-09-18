import { useState } from "react";

import { AdminTriggersList } from "@app/components/triggers/AdminTriggersList";
import { WebhookSourceDetails } from "@app/components/triggers/WebhookSourceDetails";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

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
  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);

  const { webhookSourcesWithViews, isWebhookSourcesWithViewsLoading } =
    useWebhookSourcesWithViews({
      owner,
      disabled: !isAdmin,
    });

  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = searchParam.value ?? "";

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      {selectedWebhookSourceView !== null && (
        <WebhookSourceDetails
          owner={owner}
          webhookSourceView={selectedWebhookSourceView}
          onClose={() => setSelectedWebhookSourceView(null)}
          isOpen={selectedWebhookSourceView !== null}
        />
      )}
      <AdminTriggersList
        owner={owner}
        systemSpace={space}
        filter={searchTerm}
        setSelectedWebhookSourceView={setSelectedWebhookSourceView}
        webhookSourcesWithViews={webhookSourcesWithViews}
        isWebhookSourcesWithViewsLoading={isWebhookSourcesWithViewsLoading}
      />
    </>
  );
};
