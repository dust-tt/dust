import { ConfirmContext } from "@app/components/Confirm";
import {
  GroupManagerAppointmentWarning,
  newManagersOutsideGroup,
} from "@app/components/groups/GroupManagerAppointmentWarning";
import { GroupManagersField } from "@app/components/groups/GroupManagersField";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useGovernancePermissions } from "@app/lib/swr/governance";
import { useCreateGroup, useGroup, useUpdateGroup } from "@app/lib/swr/groups";
import type { GroupWithAllowedActions } from "@app/types/api/groups";
import type { GroupType } from "@app/types/groups";
import { isRegularManualGroupKind } from "@app/types/groups";
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
import { useContext, useState } from "react";

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
  const { group, members, managers, isGroupLoading } = useGroup({
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
            group={group}
            initialName={group?.name ?? ""}
            initialMembers={members}
            initialManagers={managers}
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
  group: GroupWithAllowedActions | null;
  initialName: string;
  initialMembers: SearchMemberType[];
  initialManagers: SearchMemberType[];
  // When true, the group grants the admin role and the current user is not an
  // admin: membership is read-only (see the admin-only membership contract).
  readOnly?: boolean;
  onCreated?: (group: GroupType) => void;
  onClose: () => void;
}

function GroupForm({
  owner,
  groupId,
  group,
  initialName,
  initialMembers,
  initialManagers,
  readOnly = false,
  onCreated,
  onClose,
}: GroupFormProps) {
  const [name, setName] = useState(initialName);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(initialMembers.map((m) => m.sId))
  );
  const [selectedManagers, setSelectedManagers] =
    useState<SearchMemberType[]>(initialManagers);

  const { doCreateGroup, isCreating } = useCreateGroup({ owner });
  const { doUpdateGroup, isUpdating } = useUpdateGroup({ owner, groupId });
  const isSubmitting = isCreating || isUpdating;
  const canManageManagers = group?.allowedActions?.canAssignManagers === true;
  const confirm = useContext(ConfirmContext);
  const {
    governancePermissions,
    isLoading: isGovernanceLoading,
    isGovernancePermissionsError,
  } = useGovernancePermissions(owner, { disabled: !canManageManagers });
  const initialMemberIds = new Set(initialMembers.map((member) => member.sId));
  const hasGroupChanges =
    name.trim() !== initialName ||
    selectedMemberIds.size !== initialMemberIds.size ||
    [...selectedMemberIds].some((id) => !initialMemberIds.has(id));
  const initialManagerIds = new Set(
    initialManagers.map((manager) => manager.sId)
  );
  const hasManagerChanges =
    canManageManagers &&
    (selectedManagers.length !== initialManagerIds.size ||
      selectedManagers.some((manager) => !initialManagerIds.has(manager.sId)));
  const managersNeedingWarning =
    group &&
    isRegularManualGroupKind(group.kind) &&
    group.grantedRole !== "admin"
      ? newManagersOutsideGroup({
          initialManagers,
          selectedManagers,
          initialMembers,
          selectedMemberIds,
        })
      : [];

  const handleSubmit = async (e: MouseEvent) => {
    // Prevent DialogClose from auto-closing so we only close on success.
    e.preventDefault();
    const trimmedName = name.trim();
    const memberIds = Array.from(selectedMemberIds);
    if (groupId) {
      if (group && managersNeedingWarning.length > 0) {
        if (isGovernanceLoading || isGovernancePermissionsError) {
          return;
        }
        const confirmed = await confirm({
          title: `Appoint ${managersNeedingWarning.map((manager) => manager.fullName).join(", ")} as group manager${managersNeedingWarning.length === 1 ? "" : "s"}?`,
          message: (
            <GroupManagerAppointmentWarning
              group={group}
              managers={managersNeedingWarning}
              governancePermissions={governancePermissions}
            />
          ),
          validateLabel:
            managersNeedingWarning.length === 1
              ? "Appoint manager"
              : "Appoint managers",
          validateVariant: "warning",
        });
        if (!confirmed) {
          return;
        }
      }
      if (hasGroupChanges) {
        const result = await doUpdateGroup({ name: trimmedName, memberIds });
        if (!result) {
          return;
        }
      }
      if (hasManagerChanges) {
        const result = await doUpdateGroup({
          managerIds: selectedManagers.map((manager) => manager.sId),
        });
        if (!result) {
          return;
        }
      }
      onClose();
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
    (managersNeedingWarning.length > 0 &&
      (isGovernanceLoading || isGovernancePermissionsError)) ||
    name.trim().length === 0 ||
    (!groupId && selectedMemberIds.size === 0) ||
    (hasGroupChanges && selectedMemberIds.size === 0);

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
          {group && canManageManagers && (
            <GroupManagersField
              owner={owner}
              group={group}
              managers={selectedManagers}
              onChange={setSelectedManagers}
              disabled={isSubmitting}
            />
          )}
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
