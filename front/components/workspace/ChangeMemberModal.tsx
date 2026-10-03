import type { SearchMemberWithWorkspaceType } from "@app/components/members/MemberSelectionTable";
import { isFullUserType } from "@app/components/members/MemberSelectionTable";
import {
  GROUP_ROLE_MANAGED_MESSAGE,
  getRoleDescription,
} from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { MemberGroupsSection } from "@app/components/workspace/MemberGroupsSection";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { handleMembersRoleChange } from "@app/lib/client/members";
import { useWorkspaceGrantedRoles } from "@app/lib/swr/groups";
import type { ActiveRoleType, LightWorkspaceType } from "@app/types/user";
import { isActiveRoleType, isAdmin } from "@app/types/user";
import {
  Avatar,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

function getMemberRoleMessage({
  rolesManagedByGroups,
  role,
}: {
  rolesManagedByGroups: boolean;
  role: ActiveRoleType;
}): string {
  if (rolesManagedByGroups) {
    return GROUP_ROLE_MANAGED_MESSAGE;
  }

  return `The role defines the rights of a member of the workspace. ${getRoleDescription(
    role
  )}`;
}

/**
 * @cc [owner:philipperolet,label:security;react] delegated-member-controls
 * Group delegation MUST NOT expose workspace role changes or workspace removal. Those controls
 * require the caller's workspace manager role, even when the selected member has a full profile.
 */
export function ChangeMemberModal({
  onClose,
  member,
  mutateMembers,
  workspace,
}: {
  onClose: () => void;
  member: SearchMemberWithWorkspaceType | null;
  mutateMembers: () => void | Promise<unknown>;
  workspace: LightWorkspaceType;
}) {
  const { isManager } = useAuth();
  const canEditWorkspaceMember =
    isManager && member !== null && isFullUserType(member);
  const { role = null } = member?.workspace ?? {};

  const sendNotification = useSendNotification();
  const [selectedRole, setSelectedRole] = useState<ActiveRoleType | null>(
    role !== "none" ? role : null
  );
  const [isSaving, setIsSaving] = useState(false);

  const { grantedRoles } = useWorkspaceGrantedRoles({
    workspaceId: workspace.sId,
    disabled: !canEditWorkspaceMember,
  });

  const rolesManagedByGroups = grantedRoles.length > 0;

  const roleMessage =
    role && isActiveRoleType(role)
      ? getMemberRoleMessage({
          rolesManagedByGroups,
          role,
        })
      : "";

  // Revoking an admin requires to be an admin
  const canRevokeMember =
    canEditWorkspaceMember && (role !== "admin" || isAdmin(workspace));

  const handleSave = async () => {
    if (!selectedRole || !canEditWorkspaceMember) {
      return;
    }
    setIsSaving(true);
    await handleMembersRoleChange({
      members: member ? [member] : [],
      role: selectedRole,
      sendNotification,
    });
    await mutateMembers();
    onClose();
  };

  return (
    <Sheet
      open={!!member}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setSelectedRole(null);
          setIsSaving(false);
        }
      }}
    >
      <SheetContent>
        {member && role && isActiveRoleType(role) ? (
          <>
            <SheetHeader>
              <SheetTitle>{member.fullName || "Unreachable"}</SheetTitle>
            </SheetHeader>
            <SheetContainer>
              <div className="flex flex-col gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-4">
                  <Avatar
                    size="lg"
                    visual={member.image}
                    name={member.fullName}
                    isRounded
                  />
                  <div className="flex grow flex-col">
                    <div className="heading-base text-foreground">
                      {member.fullName}
                    </div>
                    <div className="font-normal">{member.email}</div>
                  </div>
                </div>

                {canEditWorkspaceMember && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="heading-base text-foreground">Role:</div>
                      <RoleDropDown
                        selectedRole={selectedRole || role}
                        onChange={setSelectedRole}
                        disabled={rolesManagedByGroups}
                      />
                    </div>
                    <Page.P>{roleMessage}</Page.P>
                  </div>
                )}

                <MemberGroupsSection owner={workspace} userId={member.sId} />

                {canRevokeMember && (
                  <div className="flex flex-none flex-col gap-2">
                    <div className="flex-none">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="warning"
                            label="Revoke member access"
                            size="sm"
                            disabled={member.origin === "provisioned"}
                            tooltip={
                              member.origin === "provisioned"
                                ? "This user is managed by your identity provider."
                                : undefined
                            }
                          />
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Confirm deletion</DialogTitle>
                          </DialogHeader>
                          {isSaving ? (
                            <div className="flex justify-center py-8">
                              <Spinner variant="dark" size="md" />
                            </div>
                          ) : (
                            <>
                              <DialogContainer>
                                <div>
                                  Revoke access for user{" "}
                                  <span className="font-bold">
                                    {member.fullName}
                                  </span>
                                  ?
                                </div>
                              </DialogContainer>
                              <DialogFooter
                                leftButtonProps={{
                                  label: "Cancel",
                                  variant: "outline",
                                }}
                                rightButtonProps={{
                                  label: "Yes, revoke",
                                  variant: "warning",
                                  onClick: async () => {
                                    await handleMembersRoleChange({
                                      members: [member],
                                      role: "none",
                                      sendNotification,
                                    });
                                    await mutateMembers();
                                    onClose();
                                  },
                                }}
                              />
                            </>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                    {member.origin !== "provisioned" && (
                      <Page.P>
                        Deleting a member will remove them from the workspace.
                        They will be able to rejoin if they have an invitation
                        link.
                      </Page.P>
                    )}
                  </div>
                )}
              </div>
            </SheetContainer>
            {canEditWorkspaceMember && (
              <SheetFooter
                rightButtonProps={{
                  label: "Update role",
                  onClick: handleSave,
                  disabled:
                    selectedRole === member.workspace.role ||
                    isSaving ||
                    rolesManagedByGroups,
                  isLoading: isSaving,
                }}
              />
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
