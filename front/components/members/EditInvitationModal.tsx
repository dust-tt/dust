import { ConfirmContext } from "@app/components/Confirm";
import {
  GROUP_ROLE_MANAGED_MESSAGE,
  ROLE_DESCRIPTIONS,
} from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { useSendNotification } from "@app/hooks/useNotification";
import { formatDate } from "@app/lib/i18n/format";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useContext, useEffect, useState } from "react";

export function EditInvitationModal({
  owner,
  invitation,
  onClose,
}: {
  owner: WorkspaceType;
  invitation: MembershipInvitationType | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
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

  const roleDescription = invitation
    ? t(ROLE_DESCRIPTIONS[invitation.initialRole])
    : null;
  let roleMessage = "";
  if (roleDescription !== null) {
    roleMessage = isRoleManagedByGroup
      ? t(GROUP_ROLE_MANAGED_MESSAGE)
      : t`The role defines the rights of a member for the workspace. ${roleDescription}`;
  }

  const sentDate = invitation ? formatDate(invitation.createdAt) : "";

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
          <SheetTitle>
            <Trans>Edit invitation</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          {invitation && selectedRole && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Page.H variant="h6">{invitation.inviteEmail}</Page.H>
                <div className="text-muted-foreground">
                  <Trans>Invitation sent on {sentDate}</Trans>
                  {invitation.isExpired && (
                    <span className="ml-2 text-red-500">
                      <Trans>(expired)</Trans>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="heading-base text-foreground">
                    <Trans>Role:</Trans>
                  </div>
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
                    label={t`Send invitation again`}
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
                    label={t`Revoke invitation`}
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
            label: t`Update role`,
            onClick: handleSave,
            disabled:
              selectedRole === invitation?.initialRole || isRoleManagedByGroup,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
