import {
  Button,
  Cog6ToothIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";

import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { GLOBAL_AGENTS_SID, isBuilder } from "@app/types";

type GlobalAgentActionProps = {
  agent: LightAgentConfigurationType;
  owner: WorkspaceType;
  handleToggleAgentStatus: (
    agent: LightAgentConfigurationType
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
};

export function GlobalAgentAction({
  agent,
  owner,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
}: GlobalAgentActionProps) {
  const router = useRouter();

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const hasAgentBuilderV2 = featureFlags.includes("agent_builder_v2");

  if (agent.sId === "helper") {
    return null;
  }

  const isConfigurable =
    agent.sId === GLOBAL_AGENTS_SID.RESEARCH ||
    agent.sId === GLOBAL_AGENTS_SID.DUST;

  if (isConfigurable) {
    return (
      <Button
        variant="outline"
        icon={Cog6ToothIcon}
        size="xs"
        disabled={!isBuilder(owner)}
        onClick={(e: Event) => {
          e.stopPropagation();
          void router.push(
            getAgentBuilderRoute(owner.sId, agent.sId, hasAgentBuilderV2)
          );
        }}
      />
    );
  }

  return (
    <>
      <SliderToggle
        size="xs"
        onClick={(e) => {
          e.stopPropagation();
          void handleToggleAgentStatus(agent);
        }}
        selected={agent.status === "active"}
        disabled={
          !isBuilder(owner) || agent.status === "disabled_missing_datasource"
        }
      />
      <div className="whitespace-normal" onClick={(e) => e.stopPropagation()}>
        <Dialog
          open={showDisabledFreeWorkspacePopup === agent.sId}
          onOpenChange={(open) => {
            if (!open) {
              setShowDisabledFreeWorkspacePopup(null);
            }
          }}
        >
          <DialogContent size="md">
            <DialogHeader hideButton={false}>
              <DialogTitle>Free plan</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              {`@${agent.name} is only available on our paid plans.`}
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
                onClick: () => setShowDisabledFreeWorkspacePopup(null),
              }}
              rightButtonProps={{
                label: "Check Dust plans",
                variant: "primary",
                onClick: () => {
                  void router.push(`/w/${owner.sId}/subscription`);
                },
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
