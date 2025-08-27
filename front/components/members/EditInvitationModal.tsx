import {
  Button,
  MovingMailIcon,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useContext, useEffect, useState } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { useSendNotification } from "@app/hooks/useNotification";
import { sendInvitations, updateInvitation } from "@app/lib/invitations";
import { useProvisioningStatus } from "@app/lib/swr/workos";
import type {
  ActiveRoleType,
  MembershipInvitationType,
  WorkspaceType,
} from "@app/types";

import { isInvitationExpired } from "./utils";

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

  const { roleProvisioningStatus } = useProvisioningStatus({
    workspaceId: owner.sId,
  });

  // Check if this invitation's role would be managed by provisioning groups
  const isRoleManagedByProvisioning =
    (roleProvisioningStatus.hasAdminGroup && selectedRole === "admin") ||
    (roleProvisioningStatus.hasBuilderGroup && selectedRole === "builder");

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
                <div className="text-muted-foreground dark:text-muted-foreground-night">
                  Invitation sent on{" "}
                  {new Date(invitation.createdAt).toLocaleDateString()}
                  {isInvitationExpired(invitation.createdAt) && (
                    <span className="ml-2 text-red-500">(expired)</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="heading-base text-foreground dark:text-foreground-night">
                    Role:
                  </div>
                  <RoleDropDown
                    selectedRole={selectedRole}
                    onChange={setSelectedRole}
                    disabled={isRoleManagedByProvisioning}
                  />
                </div>
                <div className="text-muted-foreground dark:text-muted-foreground-night">
                  {isRoleManagedByProvisioning ? (
                    "This invitation's role is managed by your identity provider through group provisioning (dust-admins and dust-builders groups). Role changes must be made in your identity provider."
                  ) : (
                    <>
                      The role defines the rights of a member for the workspace.{" "}
                      {ROLES_DATA[invitation.initialRole].description}
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  label="Send invitation again"
                  icon={MovingMailIcon}
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
                  icon={XMarkIcon}
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
            </div>
          )}
        </SheetContainer>
        <SheetFooter
          rightButtonProps={{
            label: "Update role",
            onClick: handleSave,
            disabled:
              selectedRole === invitation?.initialRole ||
              isRoleManagedByProvisioning,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
