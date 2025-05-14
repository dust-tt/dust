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

import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { isBuilder } from "@app/types";

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
  if (agent.sId === "helper") {
    return null;
  }

  if (agent.sId === "dust") {
    return (
      <Button
        variant="outline"
        icon={Cog6ToothIcon}
        size="xs"
        disabled={!isBuilder(owner)}
        onClick={(e: Event) => {
          e.stopPropagation();
          void router.push(`/w/${owner.sId}/builder/assistants/dust`);
        }}
      />
    );
  }

  return (
    <>
      <SliderToggle
        size="xs"
        onClick={async (e) => {
          e.stopPropagation();
          await handleToggleAgentStatus(agent);
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
