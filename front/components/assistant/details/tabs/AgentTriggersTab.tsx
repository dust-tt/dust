import { TriggerStatusChip } from "@app/components/triggers/TriggerStatusChip";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useAgentTriggers,
  useDeleteTrigger,
} from "@app/lib/swr/agent_triggers";
import { getTriggerDescription } from "@app/lib/utils/trigger_description";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionCard,
  Bell01,
  Button,
  CardGrid,
  Clock,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Plus,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

function getTriggerIcon(trigger: TriggerType) {
  switch (trigger.kind) {
    case "schedule":
      return Clock;
    case "webhook":
      return Bell01;
    default:
      assertNever(trigger);
  }
}

interface AgentTriggersTabProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  onEditTrigger: (trigger: TriggerType) => void;
  onAddTrigger: () => void;
}

export function AgentTriggersTab({
  agentConfiguration,
  owner,
  onEditTrigger,
  onAddTrigger,
}: AgentTriggersTabProps) {
  const { t } = useLingui();
  const { triggers, isTriggersLoading } = useAgentTriggers({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
  });

  const [triggerToDelete, setTriggerToDelete] = useState<TriggerType | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const sendNotification = useSendNotification();

  const deleteTrigger = useDeleteTrigger({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
  });

  const handleDeleteTrigger = async () => {
    if (!triggerToDelete) {
      return;
    }
    setIsDeleting(true);
    const success = await deleteTrigger(triggerToDelete.sId);
    setIsDeleting(false);
    setTriggerToDelete(null);

    const triggerName = triggerToDelete.name;
    if (success) {
      sendNotification({
        type: "success",
        title: t`Trigger deleted`,
        description: t`The trigger "${triggerName}" has been deleted.`,
      });
    } else {
      sendNotification({
        type: "error",
        title: t`Failed to delete trigger`,
        description: t`An error occurred while deleting the trigger.`,
      });
    }
  };

  // TODO(adrien): for now, we only show the user's triggers.
  // We might reconsider it, and display a "My triggers" section,
  // and a "How others automate this" section in the future.
  const filteredTriggers = useMemo(
    () => triggers.filter((trigger) => trigger.isEditor),
    [triggers]
  );

  const triggerToDeleteName = triggerToDelete?.name;

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          <Trans>My triggers</Trans>
        </h3>
        <Button
          label={t`Add trigger`}
          icon={Plus}
          variant="outline"
          size="sm"
          onClick={onAddTrigger}
        />
      </div>

      {isTriggersLoading ? (
        <div className="w-full p-6">
          <Spinner variant="dark" />
        </div>
      ) : filteredTriggers.length === 0 ? (
        <div className="text-muted-foreground text-sm">
          <Trans>You have no triggers set up for this agent yet.</Trans>
        </div>
      ) : (
        <CardGrid>
          {filteredTriggers.map((trigger) => (
            <ActionCard
              key={trigger.sId}
              icon={getTriggerIcon(trigger)}
              label={trigger.name}
              description={
                trigger.status === "enabled" ? (
                  getTriggerDescription(trigger)
                ) : (
                  <div className="flex flex-col items-start gap-1">
                    <span>{getTriggerDescription(trigger)}</span>
                    <TriggerStatusChip status={trigger.status} />
                  </div>
                )
              }
              // The chip counts as a clamped line: leave room for it.
              descriptionLineClamp={6}
              canAdd={false}
              disabled={trigger.status !== "enabled"}
              onClick={() => onEditTrigger(trigger)}
              onRemove={() => setTriggerToDelete(trigger)}
              cardContainerClassName="min-h-28"
            />
          ))}
        </CardGrid>
      )}

      <Dialog
        open={triggerToDelete !== null}
        onOpenChange={(open) => !open && setTriggerToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Delete trigger</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Are you sure you want to delete the trigger "
                {triggerToDeleteName}"?
              </Trans>
            </DialogDescription>
          </DialogHeader>
          {isDeleting ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <>
              <DialogContainer>
                <b>
                  <Trans>This action cannot be undone.</Trans>
                </b>
              </DialogContainer>
              <DialogFooter
                leftButtonProps={{
                  label: t`Cancel`,
                  variant: "outline",
                }}
                rightButtonProps={{
                  label: t`Delete`,
                  variant: "warning",
                  onClick: handleDeleteTrigger,
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
