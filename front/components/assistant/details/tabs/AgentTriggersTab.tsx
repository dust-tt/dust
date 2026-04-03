import { useSendNotification } from "@app/hooks/useNotification";
import {
  useAgentTriggers,
  useDeleteTrigger,
} from "@app/lib/swr/agent_triggers";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { TriggerType } from "@app/types/assistant/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionCard,
  BellIcon,
  Button,
  CardGrid,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PlusIcon,
  Spinner,
  TimeIcon,
} from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import { useMemo, useState } from "react";

function getTriggerDescription(trigger: TriggerType): string {
  switch (trigger.kind) {
    case "schedule":
      try {
        return `Runs ${cronstrue.toString(trigger.configuration.cron)}.`;
      } catch {
        return "";
      }
    case "webhook":
      return trigger.configuration.event
        ? `Triggered by ${trigger.configuration.event} events.`
        : "Triggered by webhook events.";
    default:
      assertNever(trigger);
  }
}

function getTriggerIcon(trigger: TriggerType) {
  switch (trigger.kind) {
    case "schedule":
      return TimeIcon;
    case "webhook":
      return BellIcon;
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

    if (success) {
      sendNotification({
        type: "success",
        title: "Trigger deleted",
        description: `The trigger "${triggerToDelete.name}" has been deleted.`,
      });
    } else {
      sendNotification({
        type: "error",
        title: "Failed to delete trigger",
        description: "An error occurred while deleting the trigger.",
      });
    }
  };

  // TODO(adrien): for now, we only show the user's triggers.
  // We might reconsider it, and display a "My triggers" section,
  // and a "How others automate this" section in the future.
  const filteredTriggers = useMemo(
    () => triggers.filter((t) => t.isEditor),
    [triggers]
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">My triggers</h3>
        <Button
          label="Add trigger"
          icon={PlusIcon}
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
          You have no triggers set up for this agent yet.
        </div>
      ) : (
        <CardGrid>
          {filteredTriggers.map((trigger) => (
            <ActionCard
              key={trigger.sId}
              icon={getTriggerIcon(trigger)}
              label={trigger.name}
              description={getTriggerDescription(trigger)}
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
            <DialogTitle>Delete trigger</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the trigger "
              {triggerToDelete?.name}"?
            </DialogDescription>
          </DialogHeader>
          {isDeleting ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <>
              <DialogContainer>
                <b>This action cannot be undone.</b>
              </DialogContainer>
              <DialogFooter
                leftButtonProps={{
                  label: "Cancel",
                  variant: "outline",
                }}
                rightButtonProps={{
                  label: "Delete",
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
