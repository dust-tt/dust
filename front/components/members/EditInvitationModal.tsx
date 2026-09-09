import { ConfirmContext } from "@app/components/Confirm";
import {
  GROUP_ROLE_MANAGED_MESSAGE,
  getRoleDescription,
} from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { useSendNotification } from "@app/hooks/useNotification";
import { sendInvitations, updateInvitation } from "@app/lib/invitations";
import { useWorkspaceGrantedRoles } from "@app/lib/swr/groups";
import type { MembershipInvitationType } from "@app/types/membership_invitation";
import type { ActiveRoleType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Mail01,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  XClose,
} from "@dust-tt/sparkle";
import { useContext, useEffect, useState } from "react";

function getInvitationRoleMessage({
  isRoleManagedByGroup,
  role,
}: {
  isRoleManagedByGroup: boolean;
  role: ActiveRoleType;
}): string {
  if (isRoleManagedByGroup) {
    return GROUP_ROLE_MANAGED_MESSAGE;
  }

  return `The role defines the rights of a member for the workspace. ${getRoleDescription(
    role
  )}`;
}

export function EditInvitationModal({
  owner,
  invitation,
  onClose,
}: {
  owner: WorkspaceType;
  invitation: MembershipInvitationType | null;
  onClose: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<ActiveRoleType | undefined>(
    invitation?.initialRole
  );

  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);

  // Managers cannot revoke or resend invitations targeting the admin role
  // (matches the server-side escalation guard); only admins can.
  const canManageAdminInvitation =
    invitation?.initialRole !== "admin" || isAdmin(owner);

  const { grantedRoles } = useWorkspaceGrantedRoles({
    workspaceId: owner.sId,
  });

  // Check if this invitation's role would be managed by a role-granting group.
  const isRoleManagedByGroup =
    selectedRole !== undefined && grantedRoles.some((r) => r === selectedRole);

  const roleMessage = invitation
    ? getInvitationRoleMessage({
        isRoleManagedByGroup,
        role: invitation.initialRole,
      })
    : "";

  useEffect(() => {
    if (invitation) {
      setSelectedRole(invitation.initialRole);
    }
  }, [invitation]);

  const handleSave = async () => {
    if (invitation && selectedRole) {
      await updateInvitation({
        owner,
        invitation,
        newRole: selectedRole,
        sendNotification,
        confirm,
      });
    }

    onClose();
  };

  return (
    <Sheet
      open={!!invitation}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setSelectedRole(invitation?.initialRole);
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit invitation</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          {invitation && selectedRole && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Page.H variant="h6">{invitation.inviteEmail}</Page.H>
                <div className="text-muted-foreground">
                  Invitation sent on{" "}
                  {new Date(invitation.createdAt).toLocaleDateString()}
                  {invitation.isExpired && (
                    <span className="ml-2 text-red-500">(expired)</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="heading-base text-foreground">Role:</div>
                  <RoleDropDown
                    selectedRole={selectedRole}
                    onChange={setSelectedRole}
                    disabled={isRoleManagedByGroup}
                  />
                </div>
                <div className="text-muted-foreground">{roleMessage}</div>
              </div>

              {canManageAdminInvitation && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    label="Send invitation again"
                    icon={Mail01}
                    onClick={async () => {
                      await sendInvitations({
                        owner,
                        emails: [invitation.inviteEmail],
                        invitationRole: selectedRole,
                        sendNotification,
                        isNewInvitation: false,
                      });
                    }}
                  />
                  <Button
                    variant="warning"
                    label="Revoke invitation"
                    icon={XClose}
                    disabled={owner.ssoEnforced}
                    onClick={async () => {
                      await updateInvitation({
                        invitation,
                        owner,
                        sendNotification,
                        confirm,
                      });
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </SheetContainer>
        <SheetFooter
          rightButtonProps={{
            label: "Update role",
            onClick: handleSave,
            disabled:
              selectedRole === invitation?.initialRole || isRoleManagedByGroup,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
