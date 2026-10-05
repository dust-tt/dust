import { useAppRouter } from "@app/lib/platform";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SliderToggle,
} from "@dust-tt/sparkle";

type GlobalAgentActionProps = {
  agent: Pick<LightAgentConfigurationType, "sId" | "name" | "status">;
  owner: LightWorkspaceType;
  disabled?: boolean;
  handleToggleAgentStatus: (
    agent: Pick<LightAgentConfigurationType, "sId" | "name" | "status">
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
};

export function GlobalAgentAction({
  agent,
  owner,
  disabled = false,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
}: GlobalAgentActionProps) {
  const router = useAppRouter();

  const canBeDisabled = agent.sId !== GLOBAL_AGENTS_SID.HELPER;

  if (canBeDisabled) {
    return (
      <>
        <button
          type="button"
          role="switch"
          aria-label={agent.name}
          aria-checked={agent.status === "active"}
          disabled={
            disabled ||
            owner.role !== "admin" ||
            agent.status === "disabled_missing_datasource"
          }
          onClick={(e) => {
            e.stopPropagation();
            void handleToggleAgentStatus(agent);
          }}
        >
          <SliderToggle
            selected={agent.status === "active"}
            disabled={
              disabled ||
              owner.role !== "admin" ||
              agent.status === "disabled_missing_datasource"
            }
          />
        </button>
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
                {`${agent.name} is only available on our paid plans.`}
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

  return null;
}
