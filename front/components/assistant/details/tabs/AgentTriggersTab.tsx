import {
  Avatar,
  BellIcon,
  ClockIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import {
  useAgentTriggers,
  useDeleteTrigger,
} from "@app/lib/swr/agent_triggers";
import type { WorkspaceType } from "@app/types";
import type { LightAgentConfigurationType } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

interface AgentTriggersTabProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
}

export function AgentTriggersTab({
  agentConfiguration,
  owner,
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

  const filteredTriggers = triggers.filter((t) => t.isEditor);

  return (
    <>
      {isTriggersLoading ? (
        <div className="w-full p-6">
          <Spinner variant="dark" />
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {filteredTriggers.length === 0 && (
            <div className="text-muted-foreground">
              You have no triggers setup for this agent, yet.
            </div>
          )}
          {filteredTriggers.map((trigger) => (
            <div
              key={trigger.sId}
              className="flex w-full flex-row items-center justify-between border-b pb-2"
            >
              <div className="flex w-full flex-col gap-1">
                <div className="flex w-full flex-row items-center justify-between gap-4">
                  <div className="flex flex-row items-center gap-2">
                    <Avatar
                      size="xs"
                      visual={
                        trigger.kind === "schedule" ? (
                          <ClockIcon />
                        ) : (
                          <BellIcon />
                        )
                      }
                    />
                    <div className="font-semibold">{trigger.name}</div>
                  </div>
                  <div className="self-end">
                    <Button
                      label="Delete"
                      disabled={!trigger.isEditor}
                      icon={TrashIcon}
                      variant="outline"
                      size="sm"
                      onClick={() => setTriggerToDelete(trigger)}
                    />
                  </div>
                </div>
                {trigger.kind === "schedule" && (
                  <div className="text-sm text-muted-foreground">
                    Runs {cronstrue.toString(trigger.configuration.cron)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
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
