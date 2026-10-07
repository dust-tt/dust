import { useBatchDeleteAgentConfigurations } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@dust-tt/sparkle";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface DeleteAssistantsDialogProps {
  agentConfigurations: Pick<LightAgentConfigurationType, "sId" | "usage">[];
  disabled: boolean;
  owner: LightWorkspaceType;
  onSave: () => void;
}

export function DeleteAssistantsDialog({
  agentConfigurations,
  disabled,
  owner,
  onSave,
}: DeleteAssistantsDialogProps) {
  const { t } = useLingui();
  const [isDeleting, setIsDeleting] = useState(false);
  const doDelete = useBatchDeleteAgentConfigurations({
    owner,
    agentConfigurationIds: agentConfigurations.map((a) => a.sId),
  });

  const total = agentConfigurations.reduce(
    (acc, a) => acc + (a.usage?.messageCount ?? 0),
    0
  );
  const agentCount = agentConfigurations.length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="warning"
          label={t({ message: "Archive", context: "verb, button label" })}
          disabled={disabled}
        />
      </DialogTrigger>
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>
            <Plural
              value={agentCount}
              one="Archiving # agent"
              other="Archiving # agents"
            />
          </DialogTitle>
          <DialogDescription>
            <div>
              <span className="font-bold">
                {total > 0 && (
                  <Plural
                    value={total}
                    one="These agents have been used # time in the last 30 days."
                    other="These agents have been used # times in the last 30 days."
                  />
                )}
              </span>{" "}
              <Trans>This will archive the agents for everyone.</Trans>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="font-bold">
            <Trans>Are you sure you want to proceed?</Trans>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            disabled: isDeleting,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Archive the agents`,
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
