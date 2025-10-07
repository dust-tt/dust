import { useMemo, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/details/AssistantDetails";
import { AdminTriggersList } from "@app/components/triggers/AdminTriggersList";
import { WebhookSourceDetails } from "@app/components/triggers/WebhookSourceDetails";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType, SpaceType, UserType } from "@app/types";

interface SpaceActionsListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
  user: UserType;
}

export const SystemSpaceTriggersList = ({
  owner,
  isAdmin,
  space,
  user,
}: SpaceActionsListProps) => {
  const [selectedWebhookSourceId, setSelectedWebhookSourceId] = useState<
    string | null
  >(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [agentSId, setAgentSId] = useState<string | null>(null);

  const { webhookSourcesWithViews, isWebhookSourcesWithViewsLoading } =
    useWebhookSourcesWithViews({
      owner,
      disabled: !isAdmin,
    });

  const webhookSourcesWithSystemView = useMemo(
    () =>
      webhookSourcesWithViews.map((webhookSource) => ({
        ...webhookSource,
        systemView:
          webhookSource.views.find((view) => view.spaceId === space.sId) ??
          null,
      })),
    [webhookSourcesWithViews, space.sId]
  );

  const selectedWebhookSource = useMemo(() => {
    if (selectedWebhookSourceId === null) {
      return null;
    }

    const webhookSource =
      webhookSourcesWithSystemView.find(
        (webhookSource) => webhookSource.sId === selectedWebhookSourceId
      ) ?? null;

    return webhookSource;
  }, [webhookSourcesWithSystemView, selectedWebhookSourceId]);

  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = searchParam.value ?? "";

  const handleClose = () => {
    setIsDetailsOpen(false);
  };

  const handleSetSelectedWebhookSourceId = (
    action: string | null | ((prev: string | null) => string | null)
  ) => {
    const newId =
      typeof action === "function" ? action(selectedWebhookSourceId) : action;
    setSelectedWebhookSourceId(newId);
    if (newId !== null) {
      setIsDetailsOpen(true);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <AssistantDetails
        owner={owner}
        user={user}
        assistantId={agentSId}
        onClose={() => setAgentSId(null)}
      />
      {selectedWebhookSource?.systemView && (
        <WebhookSourceDetails
          owner={owner}
          webhookSource={selectedWebhookSource}
          onClose={handleClose}
          isOpen={isDetailsOpen}
        />
      )}
      <AdminTriggersList
        owner={owner}
        filter={searchTerm}
        setSelectedWebhookSourceId={handleSetSelectedWebhookSourceId}
        webhookSourcesWithSystemView={webhookSourcesWithSystemView}
        isWebhookSourcesWithViewsLoading={isWebhookSourcesWithViewsLoading}
        setAgentSId={setAgentSId}
      />
    </>
  );
};
