import { Avatar, Button, Dialog, ElementModal, Page } from "@dust-tt/sparkle";
import type {
  ActiveRoleType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";
import { isActiveRoleType } from "@dust-tt/types";
import React, { useContext, useState } from "react";
import { useSWRConfig } from "swr";

import { ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleMembersRoleChange } from "@app/lib/client/members";

export function ChangeMemberModal({
  onClose,
  member,
  owner,
}: {
  onClose: () => void;
  member: UserTypeWithWorkspaces | null;
  owner: WorkspaceType;
}) {
  const { role = null } = member?.workspaces[0] ?? {};

  const { mutate } = useSWRConfig();
  const sendNotification = useContext(SendNotificationsContext);
  const [revokeMemberModalOpen, setRevokeMemberModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<ActiveRoleType | null>(
    role !== "none" ? role : null
  );
  const [isSaving, setIsSaving] = useState(false);

  if (!member || !role || !isActiveRoleType(role)) {
    return null;
  }

  return (
    <ElementModal
      openOnElement={member}
      onClose={() => {
        onClose();
        setSelectedRole(null);
        setIsSaving(false);
      }}
      isSaving={isSaving}
      hasChanged={selectedRole !== member.workspaces[0].role}
      title={member.fullName || "Unreachable"}
      variant="side-sm"
      onSave={async (closeModalFn: () => void) => {
        if (!selectedRole) {
          return;
        }
        setIsSaving(true);
        await handleMembersRoleChange({
          members: [member],
          role: selectedRole,
          sendNotification,
        });
        await mutate(`/api/w/${owner.sId}/members`);
        closeModalFn();
      }}
      saveLabel="Update role"
    >
      <Page variant="modal">
        <div className="mt-6 flex flex-col gap-9 text-sm text-element-700">
          <div className="flex items-center gap-4">
            <Avatar size="lg" visual={member.image} name={member.fullName} />
            <div className="flex grow flex-col">
              <div className="font-semibold text-element-900">
                {member.fullName}
              </div>
              <div className="font-normal">{member.email}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="font-bold text-element-900">Role:</div>
              <RoleDropDown
                selectedRole={selectedRole || role}
                onChange={setSelectedRole}
              />
            </div>
            <Page.P>
              The role defines the rights of a member of the workspace.{" "}
              {ROLES_DATA[role]["description"]}
            </Page.P>
          </div>
          <div className="flex flex-none flex-col gap-2">
            <div className="flex-none">
              <Button
                variant="primaryWarning"
                label="Revoke member access"
                size="sm"
                onClick={() => setRevokeMemberModalOpen(true)}
              />
            </div>
            <Page.P>
              Deleting a member will remove them from the workspace. They will
              be able to rejoin if they have an invitation link.
            </Page.P>
          </div>
        </div>
      </Page>
      <Dialog
        isOpen={revokeMemberModalOpen}
        title="Revoke member access"
        onValidate={async () => {
          await handleMembersRoleChange({
            members: [member],
            role: "none",
            sendNotification,
          });
          await mutate(`/api/w/${owner.sId}/members`);
          setRevokeMemberModalOpen(false);
          onClose();
        }}
        validateLabel="Yes, revoke"
        validateVariant="primaryWarning"
        onCancel={() => {
          setRevokeMemberModalOpen(false);
        }}
        isSaving={isSaving}
      >
        <div>
          Revoke access for user{" "}
          <span className="font-bold">{member.fullName}</span>?
        </div>
      </Dialog>
    </ElementModal>
  );
}
