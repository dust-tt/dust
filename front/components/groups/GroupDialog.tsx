import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useCreateGroup, useGroup, useUpdateGroup } from "@app/lib/swr/groups";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoCircle,
  Input,
  Spinner,
} from "@dust-tt/sparkle";
import type { MouseEvent } from "react";
import { useState } from "react";

interface GroupDialogProps {
  owner: LightWorkspaceType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // When set, the dialog edits the existing group; otherwise it creates one.
  groupId?: string | null;
  onCreated?: (group: GroupType) => void;
}

export function GroupDialog({
  owner,
  isOpen,
  onOpenChange,
  groupId = null,
  onCreated,
}: GroupDialogProps) {
  const isEdit = groupId !== null;

  const { isAdmin } = useAuth();
  const { group, members, isGroupLoading } = useGroup({
    owner,
    groupId,
    disabled: !isOpen,
  });

  // Managing the membership of a group that grants the admin role is restricted
  // to admins: adding a member escalates them to admin. Managers can view but
  // not edit such a group.
  const isReadOnlyForManager = !isAdmin && group?.grantedRole === "admin";

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
            readOnly={isReadOnlyForManager}
            onCreated={onCreated}
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
  owner: LightWorkspaceType;
  groupId: string | null;
  initialName: string;
  initialMembers: SearchMemberType[];
  // When true, the group grants the admin role and the current user is not an
  // admin: membership is read-only (see the admin-only membership contract).
  readOnly?: boolean;
  onCreated?: (group: GroupType) => void;
  onClose: () => void;
}

function GroupForm({
  owner,
  groupId,
  initialName,
  initialMembers,
  readOnly = false,
  onCreated,
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
    if (groupId) {
      const result = await doUpdateGroup({ name: trimmedName, memberIds });
      if (result) {
        onClose();
      }
      return;
    }

    const result = await doCreateGroup({ name: trimmedName, memberIds });
    if (result) {
      onCreated?.(result.group);
      onClose();
    }
  };

  const shouldDisableButton =
    readOnly ||
    isSubmitting ||
    name.trim().length === 0 ||
    selectedMemberIds.size === 0;

  return (
    <>
      <DialogContainer>
        <div className="flex flex-col gap-5">
          {readOnly && (
            <ContentMessage
              variant="warning"
              icon={InfoCircle}
              title="Managed by admins"
              size="sm"
            >
              This group grants the Admin role. Only workspace admins can change
              its members.
            </ContentMessage>
          )}
          <Input
            name="group-name"
            label="Group name"
            placeholder="e.g. Sales"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly}
            autoFocus
          />
          <MemberSelectionTable
            owner={owner}
            selectedMemberIds={selectedMemberIds}
            onSelectionChange={(ids) => {
              if (readOnly) {
                return;
              }
              setSelectedMemberIds(ids);
            }}
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
