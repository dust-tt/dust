import { assistantUsageMessage } from "@app/components/assistant/Usage";
import {
  useAgentUsage,
  useDeleteAgentConfiguration,
} from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionStopSignIcon,
  ActionTrashIcon,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface DeprecateAgentDialogProps {
  agent: LightAgentConfigurationType;
  // The agent suggested to switch to instead (the other agent of the pair).
  alternative: LightAgentConfigurationType;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function DeprecateAgentDialog({
  agent,
  alternative,
  isOpen,
  onClose,
  owner,
}: DeprecateAgentDialogProps) {
  const agentUsage = useAgentUsage({
    agentConfigurationId: agent.sId,
    disabled: !isOpen,
    workspaceId: owner.sId,
  });

  const [isArchiving, setIsArchiving] = useState(false);
  const doDelete = useDeleteAgentConfiguration({
    owner,
    agentConfiguration: agent,
  });

  const onArchive = async () => {
    setIsArchiving(true);
    await doDelete();
    setIsArchiving(false);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>Deprecate @{agent.name}</DialogTitle>
          <DialogDescription>
            {assistantUsageMessage({
              usage: agentUsage.agentUsage,
              isError: agentUsage.isAgentUsageError,
              isLoading: agentUsage.isAgentUsageLoading,
              assistantName: agent.name,
            })}{" "}
            Choose how you want to retire this agent in favor of @
            {alternative.name}.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-40 shrink-0">
                <Button
                  icon={ActionStopSignIcon}
                  variant="outline"
                  disabled
                  size="sm"
                  className="w-full justify-start"
                  label="Set as deprecated"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Will keep the agent usable but nudge users to switch to the
                other agent.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-40 shrink-0">
                <Button
                  icon={ActionTrashIcon}
                  variant="warning"
                  size="sm"
                  className="w-full justify-start"
                  disabled={isArchiving}
                  onClick={onArchive}
                  label="Archive"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Archives the agent for everyone. Make sure the agent is not used
                anymore.
              </p>
            </div>
          </div>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
