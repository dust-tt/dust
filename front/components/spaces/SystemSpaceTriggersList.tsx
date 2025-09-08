import * as React from "react";
import { useCallback, useMemo, useState } from "react";

import { useQueryParams } from "@app/hooks/useQueryParams";
import { useWebhookSources } from "@app/lib/swr/webhook_sources";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";
import { WebhookSourceDetails } from "@app/components/spaces/triggers/WebhookSourceDetails";
import { WebhookSourceList } from "@app/components/spaces/triggers/WebhookSourceList";

interface SpaceTriggersListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const SystemSpaceTriggersList = ({
  owner,
  isAdmin,
  space,
}: SpaceTriggersListProps) => {
  const [webhookSourceToShow, setWebhookSourceToShow] =
    useState<WebhookSourceType | null>(null);

  const { webhookSources } = useWebhookSources({
    workspaceId: owner.sId,
  });

  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = searchParam.value || "";

  const handleClose = useCallback(() => {
    setWebhookSourceToShow(null);
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      {webhookSourceToShow && (
        <WebhookSourceDetails
          owner={owner}
          webhookSource={webhookSourceToShow ?? null}
          onClose={handleClose}
          isOpen={!!webhookSourceToShow}
        />
      )}
      <WebhookSourceList
        owner={owner}
        filter={searchTerm}
        webhookSources={webhookSources}
        setWebhookSourceToShow={setWebhookSourceToShow}
      />
    </>
  );
};
