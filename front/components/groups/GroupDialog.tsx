import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import { useCreateGroup, useGroup, useUpdateGroup } from "@app/lib/swr/groups";
import type { WorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@dust-tt/sparkle";
import { type MouseEvent, useState } from "react";

interface GroupDialogProps {
  owner: WorkspaceType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // When set, the dialog edits the existing group; otherwise it creates one.
  groupId?: string | null;
}

export function GroupDialog({
  owner,
  isOpen,
  onOpenChange,
  groupId = null,
}: GroupDialogProps) {
  const isEdit = groupId !== null;

  const { group, members, isGroupLoading } = useGroup({
    owner,
    groupId,
    disabled: !isOpen,
  });

  // In edit mode we wait for the group and its members before mounting the
  // form so the member table can seed its selection from the fetched members.
  const isReady = !isGroupLoading;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit group" : "New group"}</DialogTitle>
        </DialogHeader>
        {isReady ? (
          <GroupForm
            key={groupId ?? "new"}
            owner={owner}
            groupId={groupId}
            initialName={group?.name ?? ""}
            initialMembers={members}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <DialogContainer>
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          </DialogContainer>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface GroupFormProps {
  owner: WorkspaceType;
  groupId: string | null;
  initialName: string;
  initialMembers: SearchMemberType[];
  onClose: () => void;
}

function GroupForm({
  owner,
  groupId,
  initialName,
  initialMembers,
  onClose,
}: GroupFormProps) {
  const [name, setName] = useState(initialName);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(initialMembers.map((m) => m.sId))
  );

  const { doCreateGroup, isCreating } = useCreateGroup({ owner });
  const { doUpdateGroup, isUpdating } = useUpdateGroup({ owner, groupId });
  const isSubmitting = isCreating || isUpdating;

  const handleSubmit = async (e: MouseEvent) => {
    // Prevent DialogClose from auto-closing so we only close on success.
    e.preventDefault();
    const trimmedName = name.trim();
    const memberIds = Array.from(selectedMemberIds);
    const result = groupId
      ? await doUpdateGroup({ name: trimmedName, memberIds })
      : await doCreateGroup({ name: trimmedName, memberIds });

    if (result) {
      onClose();
    }
  };

  const shouldDisableButton =
    isSubmitting || name.trim().length === 0 || selectedMemberIds.size === 0;

  return (
    <>
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
            initialMembers={initialMembers}
          />
        </div>
      </DialogContainer>
      <DialogFooter
        leftButtonProps={{ label: "Cancel", variant: "ghost" }}
        rightButtonProps={{
          label: groupId ? "Save" : "Create",
          variant: "primary",
          onClick: handleSubmit,
          disabled: shouldDisableButton,
          isLoading: isSubmitting,
        }}
      />
    </>
  );
}
