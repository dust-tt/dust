import {
  useAgentConfigurations,
  useBatchUpdateAgentScope,
} from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
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

interface UnpublishAssistantsDialogProps {
  agentConfigurations: LightAgentConfigurationType[];
  isOpen: boolean;
  owner: LightWorkspaceType;
  onClose: () => void;
  onSave: () => void;
}

export function UnpublishAssistantsDialog({
  agentConfigurations,
  isOpen,
  owner,
  onClose,
  onSave,
}: UnpublishAssistantsDialogProps) {
  const [isUnpublishing, setIsUnpublishing] = useState(false);

  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: null,
      disabled: true,
    });

  const batchUpdateAgentScope = useBatchUpdateAgentScope({ owner });

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
            Unpublishing {agentConfigurations.length} agent
            {pluralize(agentConfigurations.length)}
          </DialogTitle>
          <DialogDescription>
            <div>
              <span className="font-bold">
                {total > 0 &&
                  `These agents have been used ${total} time${pluralize(total)} in the last 30 days.&nbsp;`}
              </span>
              Unpublished agents will no longer be accessible to everyone in the
              workspace. Members will need to manually add them to use them.
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="font-bold">Are you sure you want to proceed?</div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            disabled: isUnpublishing,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Unpublish",
            variant: "warning",
            disabled: isUnpublishing,
            onClick: async (e: React.MouseEvent) => {
              e.preventDefault();
              setIsUnpublishing(true);
              await batchUpdateAgentScope(
                agentConfigurations.map((a) => a.sId),
                { scope: "hidden" }
              );
              void mutateAgentConfigurations();
              setIsUnpublishing(false);
              onSave();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
