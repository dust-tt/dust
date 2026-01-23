import { useMemo, useState } from "react";

import { AgentDetails } from "@app/components/assistant/details/AgentDetails";
import { AdminTriggersList } from "@app/components/triggers/AdminTriggersList";
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

  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = searchParam.value ?? "";

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <AgentDetails
        owner={owner}
        user={user}
        agentId={agentSId}
        onClose={() => setAgentSId(null)}
      />
      <AdminTriggersList
        owner={owner}
        filter={searchTerm}
        webhookSourcesWithSystemView={webhookSourcesWithSystemView}
        isWebhookSourcesWithViewsLoading={isWebhookSourcesWithViewsLoading}
        setAgentSId={setAgentSId}
      />
    </>
  );
};
