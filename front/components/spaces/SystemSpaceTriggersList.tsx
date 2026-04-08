import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { AdminTriggersList } from "@app/components/triggers/AdminTriggersList";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { useMemo, useState } from "react";

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
  const [agentId, setAgentId] = useState<string | null>(null);

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
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={agentId}
        onClose={() => setAgentId(null)}
      />
      <AdminTriggersList
        owner={owner}
        filter={searchTerm}
        webhookSourcesWithSystemView={webhookSourcesWithSystemView}
        isWebhookSourcesWithViewsLoading={isWebhookSourcesWithViewsLoading}
        setAgentId={setAgentId}
      />
    </>
  );
};
