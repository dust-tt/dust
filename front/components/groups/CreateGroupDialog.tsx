import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import { useCreateGroup } from "@app/lib/swr/groups";
import type { WorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface CreateGroupDialogProps {
  owner: WorkspaceType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGroupDialog({
  owner,
  isOpen,
  onOpenChange,
}: CreateGroupDialogProps) {
  const [name, setName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set()
  );

  const { doCreateGroup, isCreating } = useCreateGroup({ owner });

  useEffect(() => {
    if (isOpen) {
      setName("");
      setSelectedMemberIds(new Set());
    }
  }, [isOpen]);

  const handleCreate = async () => {
    const result = await doCreateGroup({
      name: name.trim(),
      memberIds: Array.from(selectedMemberIds),
    });
    if (result) {
      onOpenChange(false);
    }
  };

  const shouldDisableButton =
    isCreating || name.trim().length === 0 || selectedMemberIds.size === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-5">
            <Input
              name="group-name"
              label="Group name"
              placeholder="e.g. Sales"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <MemberSelectionTable
              owner={owner}
              selectedMemberIds={selectedMemberIds}
              onSelectionChange={(ids) => setSelectedMemberIds(ids)}
            />
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{ label: "Cancel", variant: "ghost" }}
          rightButtonProps={{
            label: "Create",
            variant: "primary",
            onClick: handleCreate,
            disabled: shouldDisableButton,
            isLoading: isCreating,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
