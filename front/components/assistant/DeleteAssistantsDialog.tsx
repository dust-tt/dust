import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useBatchDeleteAgentConfigurations } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";

interface DeleteAssistantsDialogProps {
  agentConfigurations: LightAgentConfigurationType[];
  isOpen: boolean;
  isPrivateAssistant?: boolean;
  owner: LightWorkspaceType;
  onClose: () => void;
  onSave: () => void;
}

export function DeleteAssistantsDialog({
  agentConfigurations,
  isOpen,
  owner,
  onClose,
  onSave,
}: DeleteAssistantsDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const doDelete = useBatchDeleteAgentConfigurations({
    owner,
    agentConfigurationIds: agentConfigurations.map((a) => a.sId),
  });

  const total = agentConfigurations.reduce(
    (acc, a) => acc + (a.usage?.messageCount ?? 0),
    0
  );

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
          <DialogTitle>
            Archiving {agentConfigurations.length} agents
          </DialogTitle>
          <DialogDescription>
            <div>
              <span className="font-bold">
                {total > 0 &&
                  `These agents have been used ${total} time${pluralize(total)} in the last 30 days.`}
              </span>{" "}
              This will archive the agents for everyone.
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="font-bold">Are you sure you want to proceed?</div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            disabled: isDeleting,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Archive the agents",
            variant: "warning",
            disabled: isDeleting,
            onClick: async (e: React.MouseEvent) => {
              e.preventDefault();
              setIsDeleting(true);
              await doDelete();
              setIsDeleting(false);
              onSave();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
