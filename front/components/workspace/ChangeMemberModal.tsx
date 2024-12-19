import {
  Avatar,
  Button,
  Dialog,
  ElementModal,
  Page,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { ActiveRoleType, UserTypeWithWorkspaces } from "@dust-tt/types";
import { isActiveRoleType } from "@dust-tt/types";
import { useState } from "react";
import type { KeyedMutator } from "swr";

import { ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { handleMembersRoleChange } from "@app/lib/client/members";
import type { SearchMembersResponseBody } from "@app/pages/api/w/[wId]/members/search";

export function ChangeMemberModal({
  onClose,
  member,
  mutateMembers,
}: {
  onClose: () => void;
  member: UserTypeWithWorkspaces | null;
  mutateMembers: KeyedMutator<SearchMembersResponseBody>;
}) {
  const { role = null } = member?.workspaces[0] ?? {};

  const sendNotification = useSendNotification();
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
        await mutateMembers();
        closeModalFn();
      }}
      saveLabel="Update role"
    >
      <Page variant="modal">
        <div className="mt-6 flex flex-col gap-9 text-sm text-element-700">
          <div className="flex items-center gap-4">
            <Avatar size="lg" visual={member.image} name={member.fullName} />
            <div className="flex grow flex-col">
              <div className="font-semibold text-foreground">
                {member.fullName}
              </div>
              <div className="font-normal">{member.email}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="font-bold text-foreground">Role:</div>
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
                variant="warning"
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
          await mutateMembers();
          setRevokeMemberModalOpen(false);
          onClose();
        }}
        validateLabel="Yes, revoke"
        validateVariant="warning"
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
