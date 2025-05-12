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
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";
import { pluralize } from "@app/types";

interface DeleteAssistantsDialogProps {
  agentConfigurations: LightAgentConfigurationType[];
  isOpen: boolean;
  isPrivateAssistant?: boolean;
  onClose: () => void;
  setSelection: (selection: string[]) => void;
  owner: LightWorkspaceType;
}

export function DeleteAssistantsDialog({
  agentConfigurations,
  isOpen,
  onClose,
  owner,
  setSelection,
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
              This will archive the agents for everyone. You can restore them
              anytime in the Manage Agents page.
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
              setSelection([]);
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
