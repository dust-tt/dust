import { GroupManagersField } from "@app/components/groups/GroupManagersField";
import { useGroupManagerAppointmentReview } from "@app/components/groups/useGroupManagerAppointmentReview";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useCreateGroup, useGroup, useUpdateGroup } from "@app/lib/swr/groups";
import type { GroupWithAllowedActions } from "@app/types/api/groups";
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
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const isEdit = groupId !== null;

  const { group, members, managers, isGroupLoading } = useGroup({
    owner,
    groupId,
    disabled: !isOpen,
  });

  // Managing the membership of a privileged group (e.g. one granting the admin role)
  // is restricted to admins: adding a member gives them admin-level powers. Managers
  // can view but not edit such a group's membership.
  const isReadOnlyForManager =
    isEdit && group?.allowedActions?.canEditMembers !== true;

  // In edit mode we wait for the group and its members before mounting the
  // form so the member table can seed its selection from the fetched members.
  const isReady = !isGroupLoading;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t`Edit group` : t`New group`}</DialogTitle>
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
  // When true, the group is privileged and the current user is not an admin:
  // membership is read-only (see the `privileged-group-admin-only` contract).
  readOnly?: boolean;
  onCreated?: (group: GroupType) => void;
  onClose: () => void;
}

function GroupForm({
  owner,
  groupId,
  group,
  initialName: loadedName,
  initialMembers: loadedMembers,
  initialManagers: loadedManagers,
  readOnly = false,
  onCreated,
  onClose,
}: GroupFormProps) {
  const { t } = useLingui();
  // Only this form's successful saves advance the baseline; SWR refreshes must not.
  const [initialName, setInitialName] = useState(loadedName);
  const [initialMembers] = useState(loadedMembers);
  const [initialManagers] = useState(loadedManagers);
  const [initialMemberIds, setInitialMemberIds] = useState(
    () => new Set(initialMembers.map((member) => member.sId))
  );
  const { isManager } = useAuth();
  const [name, setName] = useState(initialName);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(initialMembers.map((m) => m.sId))
  );
  const [selectedManagers, setSelectedManagers] =
    useState<SearchMemberType[]>(initialManagers);

  const { doCreateGroup, isCreating } = useCreateGroup({ owner });
  const { doUpdateGroup, isUpdating } = useUpdateGroup({ owner, groupId });
  const isSubmitting = isCreating || isUpdating;
  const canEditDetails =
    !groupId || group?.allowedActions?.canEditDetails === true;
  const canAssignManagers = groupId
    ? group?.allowedActions?.canAssignManagers === true
    : isManager;
  const managerGroup = group ?? {
    name: name.trim(),
    kind: "regular_manual" as const,
    grantedRole: null,
  };
  const { confirmAppointment } = useGroupManagerAppointmentReview({
    group: managerGroup,
    initialManagers,
    selectedManagers,
    initialMembers,
    selectedMemberIds,
  });
  const hasNameChanges = name.trim() !== initialName;
  const memberDiff = {
    add: [...selectedMemberIds].filter((id) => !initialMemberIds.has(id)),
    remove: [...initialMemberIds].filter((id) => !selectedMemberIds.has(id)),
  };
  const hasMemberChanges =
    memberDiff.add.length > 0 || memberDiff.remove.length > 0;
  const initialManagerIds = new Set(
    initialManagers.map((manager) => manager.sId)
  );
  const selectedManagerIds = new Set(
    selectedManagers.map((manager) => manager.sId)
  );
  const managerDiff = {
    add: [...selectedManagerIds].filter((id) => !initialManagerIds.has(id)),
    remove: [...initialManagerIds].filter((id) => !selectedManagerIds.has(id)),
  };
  const hasManagerChanges =
    canAssignManagers &&
    (managerDiff.add.length > 0 || managerDiff.remove.length > 0);
  const selectedMemberCount = selectedMemberIds.size;
  const shouldDisableButton =
    (readOnly && !canAssignManagers) ||
    isSubmitting ||
    name.trim().length === 0 ||
    (!groupId && selectedMemberIds.size === 0) ||
    ((hasNameChanges || hasMemberChanges) && selectedMemberIds.size === 0);

  /**
   * @cc [owner:philipperolet,label:product;security] manager-save-order
   * Manager assignments MUST only be updated after appointment review succeeds and any
   * group details update succeeds. A failed step MUST stop later updates.
   */
  /**
   * @cc [owner:philipperolet,label:concurrency;react] group-save-baseline
   * Diffs MUST use this form's baseline, not refreshed server lists. Successful name or member
   * saves MUST advance only their submitted baseline so a later failure can be retried.
   */
  async function saveExistingGroup(): Promise<boolean> {
    if (!(await confirmAppointment())) {
      return false;
    }
    if (hasNameChanges) {
      const result = await doUpdateGroup({
        name: name.trim(),
      });
      if (!result) {
        return false;
      }
      setInitialName(name.trim());
    }
    if (hasMemberChanges) {
      const result = await doUpdateGroup({ memberDiff });
      if (!result) {
        return false;
      }
      setInitialMemberIds(new Set(selectedMemberIds));
    }
    if (hasManagerChanges) {
      const result = await doUpdateGroup({ managerDiff });
      if (!result) {
        return false;
      }
    }
    return true;
  }

  const handleSubmit = async (e: MouseEvent) => {
    // Prevent DialogClose from auto-closing so we only close on success.
    e.preventDefault();
    if (groupId) {
      const saved = await saveExistingGroup();
      if (saved) {
        onClose();
      }
      return;
    }

    if (!(await confirmAppointment())) {
      return;
    }
    const result = await doCreateGroup({
      name: name.trim(),
      memberIds: Array.from(selectedMemberIds),
      managerIds: canAssignManagers
        ? selectedManagers.map((manager) => manager.sId)
        : undefined,
    });
    if (result) {
      onCreated?.(result.group);
      onClose();
    }
  };

  return (
    <>
      <DialogContainer>
        <div className="flex flex-col gap-5">
          {readOnly && group?.grantedRole === "admin" && (
            <ContentMessage
              variant="warning"
              icon={InfoCircle}
              title={t`Managed by admins`}
              size="sm"
            >
              <Trans>
                This group grants the Admin role. Only workspace admins can
                change its members.
              </Trans>
            </ContentMessage>
          )}
          <Input
            name="group-name"
            label={t`Group name`}
            placeholder={t`e.g. Sales`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly || !canEditDetails}
            autoFocus
          />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              <Trans>Group members ({selectedMemberCount})</Trans>
            </h3>
            <MemberSelectionTable
              owner={owner}
              selectedMemberIds={selectedMemberIds}
              onSelectionChange={setSelectedMemberIds}
              initialMembers={initialMembers}
              disabled={readOnly || isSubmitting}
            />
          </div>
          {canAssignManagers && (
            <GroupManagersField
              owner={owner}
              group={managerGroup}
              managers={selectedManagers}
              groupMemberIds={
                new Set(
                  [...initialMemberIds].filter((id) =>
                    selectedMemberIds.has(id)
                  )
                )
              }
              onChange={setSelectedManagers}
              disabled={isSubmitting}
            />
          )}
        </div>
      </DialogContainer>
      <DialogFooter
        leftButtonProps={{ label: t`Cancel`, variant: "ghost" }}
        rightButtonProps={{
          label: groupId ? t`Save` : t`Create`,
          variant: "primary",
          onClick: handleSubmit,
          disabled: shouldDisableButton,
          isLoading: isSubmitting,
        }}
      />
    </>
  );
}
