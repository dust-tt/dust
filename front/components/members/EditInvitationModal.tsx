import {
  Button,
  ElementModal,
  MovingMailIcon,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  ActiveRoleType,
  MembershipInvitationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useState } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { sendInvitations, updateInvitation } from "@app/lib/invitations";

export function EditInvitationModal({
  owner,
  invitation,
  onClose,
}: {
  owner: WorkspaceType;
  invitation: MembershipInvitationType;
  onClose: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<ActiveRoleType>(
    invitation.initialRole
  );
  const sendNotification = useContext(SendNotificationsContext);
  const confirm = useContext(ConfirmContext);

  return (
    <ElementModal
      title="Edit invitation"
      openOnElement={invitation}
      onClose={() => {
        onClose();
        setSelectedRole(invitation.initialRole);
      }}
      hasChanged={selectedRole !== invitation.initialRole}
      variant="side-sm"
      onSave={async (closeModalFn) => {
        await updateInvitation({
          owner,
          invitation,
          newRole: selectedRole,
          sendNotification,
          confirm,
        });
        closeModalFn();
      }}
      saveLabel="Update role"
    >
      <Page variant="modal">
        <Page.Layout direction="vertical">
          <Page.Layout direction="horizontal" sizing="grow" gap="sm">
            <Page.H variant="h6">{invitation.inviteEmail}</Page.H>
          </Page.Layout>
          <div className="grow font-normal text-element-700">
            Invitation sent on{" "}
            {new Date(invitation.createdAt).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2">
            <div className="font-semibold text-element-900">Role:</div>
            <RoleDropDown
              selectedRole={selectedRole}
              onChange={setSelectedRole}
            />
          </div>
          <div className="grow font-normal text-element-700">
            The role defines the rights of a member fo the workspace.{" "}
            {ROLES_DATA[invitation.initialRole].description}
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="mt-4"
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
              className="mt-4"
              variant="primaryWarning"
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
        </Page.Layout>
      </Page>
    </ElementModal>
  );
}
