import { GlobalAgentAction } from "@app/components/assistant/manager/GlobalAgentAction";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { TRACKING_AREAS, trackEvent } from "@app/lib/tracking";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

type DefaultAgentToggleProps = {
  owner: LightWorkspaceType;
  agent: Pick<LightAgentConfigurationType, "sId" | "name" | "status">;
  onRefresh: () => void;
};

/**
 * @cc [owner:aubin-tchoi,label:product] default-agent-toggle
 * Only admins may update default-agent status. Paid-plan restrictions MUST show the
 * existing upgrade dialog, and unsuccessful updates MUST leave the current status unchanged.
 */
export function DefaultAgentToggle({
  owner,
  agent,
  onRefresh,
}: DefaultAgentToggleProps) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);

  const handleToggle = async () => {
    if (owner.role !== "admin" || isUpdating) {
      return;
    }
    if (agent.status === "disabled_free_workspace") {
      setShowDisabledFreeWorkspacePopup(agent.sId);
      return;
    }
    const status =
      agent.status === "disabled_by_admin" ? "active" : "disabled_by_admin";
    setIsUpdating(true);
    try {
      const response = await clientFetch(
        `/api/w/${owner.sId}/assistant/global_agents/${agent.sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!response.ok) {
        throw new Error("Could not update agent");
      }
      trackEvent({
        area: TRACKING_AREAS.BUILDER,
        object: "default_agent_toggle",
        extra: { agent_id: agent.sId, status },
      });
      await onRefresh();
    } catch {
      sendNotification({
        type: "error",
        title: t`Could not update agent. Please try again.`,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <GlobalAgentAction
      owner={owner}
      agent={agent}
      disabled={isUpdating}
      handleToggleAgentStatus={handleToggle}
      showDisabledFreeWorkspacePopup={showDisabledFreeWorkspacePopup}
      setShowDisabledFreeWorkspacePopup={setShowDisabledFreeWorkspacePopup}
    />
  );
}
