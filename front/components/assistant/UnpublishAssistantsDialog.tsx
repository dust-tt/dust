import {
  useAgentConfigurations,
  useBatchUpdateAgentScope,
} from "@app/lib/swr/assistants";
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

interface UnpublishAssistantsDialogProps {
  agentConfigurations: Pick<LightAgentConfigurationType, "sId" | "usage">[];
  disabled: boolean;
  owner: LightWorkspaceType;
  onSave: () => void;
}

export function UnpublishAssistantsDialog({
  agentConfigurations,
  disabled,
  owner,
  onSave,
}: UnpublishAssistantsDialogProps) {
  const { t } = useLingui();
  const [isUnpublishing, setIsUnpublishing] = useState(false);

  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Any view works; the concrete key is used to invalidate all views.
      disabled: true,
    });

  const batchUpdateAgentScope = useBatchUpdateAgentScope({ owner });

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
          variant="primary"
          label={t`Unpublish`}
          disabled={disabled}
        />
      </DialogTrigger>
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>
            <Plural
              value={agentCount}
              one="Unpublishing # agent"
              other="Unpublishing # agents"
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
              <Trans>
                Unpublished agents will no longer be accessible to everyone in
                the workspace.
              </Trans>{" "}
              <Trans>Members will need to manually add them to use them.</Trans>
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
            disabled: isUnpublishing,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Unpublish`,
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
