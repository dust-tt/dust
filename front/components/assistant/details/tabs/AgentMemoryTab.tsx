import {
  Card,
  CardActionButton,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import {
  useAgentMemoriesForUser,
  useDeleteAgentMemory,
} from "@app/lib/swr/agent_memories";
import { timeAgoFrom } from "@app/lib/utils";
import type { AgentConfigurationType, LightWorkspaceType } from "@app/types";

type DeleteMemoryDialogProps = {
  owner: LightWorkspaceType;
  onClose: (deleted: boolean) => void;
  memoryId: string;
  agentConfiguration: AgentConfigurationType;
  isOpen: boolean;
};

function DeleteMemoryDialog({
  owner,
  agentConfiguration,
  memoryId,
  isOpen,
  onClose,
}: DeleteMemoryDialogProps) {
  const { deleteMemory } = useDeleteAgentMemory({ owner, agentConfiguration });

  const [isLoading, setIsLoading] = useState(false);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Deletion</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div>Are you sure you want to delete this memory ?</div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            disabled: isLoading,
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            isLoading,
            label: "Delete",
            variant: "warning",
            disabled: isLoading,
            onClick: async () => {
              setIsLoading(true);
              await deleteMemory(memoryId);
              setIsLoading(false);
              onClose(true);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface AgentMemoryTabProps {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType;
}

export function AgentMemoryTab({
  owner,
  agentConfiguration,
}: AgentMemoryTabProps) {
  const { memories, isMemoriesLoading } = useAgentMemoriesForUser({
    owner,
    agentConfiguration,
  });

  const [memoryToDelete, setMemoryToDelete] = useState<string | undefined>(
    undefined
  );

  return (
    <div className="flex flex-col gap-4">
      {memoryToDelete && (
        <DeleteMemoryDialog
          owner={owner}
          agentConfiguration={agentConfiguration}
          memoryId={memoryToDelete}
          isOpen={memoryToDelete !== undefined}
          onClose={() => {
            setMemoryToDelete(undefined);
          }}
        />
      )}

      <div className="flex flex-col gap-4">
        <Page.SectionHeader
          title="Saved memories"
          description="Personal details this agent remembers from your conversations."
        />

        {isMemoriesLoading ? (
          <div className="mt-6 flex h-full w-full items-center justify-center">
            <Spinner size="md" />
          </div>
        ) : (
          <>
            {memories.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No memories yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {memories.map((memory) => (
                  <Card
                    key={memory.sId}
                    size={"md"}
                    className="flex flex-col gap-2"
                    action={
                      <CardActionButton
                        size="mini"
                        icon={TrashIcon}
                        onClick={() => {
                          setMemoryToDelete(memory.sId);
                        }}
                      />
                    }
                  >
                    <div className="flex flex-col gap-2">
                      <div className="text-xs text-muted-foreground">
                        {timeAgoFrom(new Date(memory.lastUpdated).getTime())}{" "}
                        ago
                      </div>
                      <div className="text-sm text-foreground dark:text-foreground-night">
                        {memory.content}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
