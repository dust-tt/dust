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
import type { KeyedMutator } from "swr";

import { ROLES_DATA } from "@app/components/members/Roles";
import { RoleDropDown } from "@app/components/members/RolesDropDown";
import { useSendNotification } from "@app/hooks/useNotification";
import { handleMembersRoleChange } from "@app/lib/client/members";
import { useProvisioningStatus } from "@app/lib/swr/workos";
import type { SearchMembersResponseBody } from "@app/pages/api/w/[wId]/members/search";
import type {
  ActiveRoleType,
  LightWorkspaceType,
  UserTypeWithWorkspace,
} from "@app/types";
import { isActiveRoleType } from "@app/types";

export function ChangeMemberModal({
  onClose,
  member,
  mutateMembers,
  workspace,
}: {
  onClose: () => void;
  member: UserTypeWithWorkspace | null;
  mutateMembers: KeyedMutator<SearchMembersResponseBody>;
  workspace: LightWorkspaceType;
}) {
  const { role = null } = member?.workspace ?? {};

  const sendNotification = useSendNotification();
  const [selectedRole, setSelectedRole] = useState<ActiveRoleType | null>(
    role !== "none" ? role : null
  );
  const [isSaving, setIsSaving] = useState(false);

  const { roleProvisioningStatus } = useProvisioningStatus({
    workspaceId: workspace.sId,
  });

  const hasActiveRoleProvisioningGroups = () => {
    return (
      roleProvisioningStatus.hasAdminGroup ||
      roleProvisioningStatus.hasBuilderGroup
    );
  };

  const handleSave = async () => {
    if (!selectedRole) {
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
              <div className="flex flex-col gap-6 text-sm text-muted-foreground dark:text-muted-foreground-night">
                <div className="flex items-center gap-4">
                  <Avatar
                    size="lg"
                    visual={member.image}
                    name={member.fullName}
                  />
                  <div className="flex grow flex-col">
                    <div className="heading-base text-foreground dark:text-foreground-night">
                      {member.fullName}
                    </div>
                    <div className="font-normal">{member.email}</div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="heading-base text-foreground dark:text-foreground-night">
                      Role:
                    </div>
                    <RoleDropDown
                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                      selectedRole={selectedRole || role}
                      onChange={setSelectedRole}
                      disabled={hasActiveRoleProvisioningGroups()}
                    />
                  </div>
                  <Page.P>
                    {hasActiveRoleProvisioningGroups() ? (
                      "The roles are managed by your identity provider through group provisioning (dust-admins and dust-builders groups). Role changes must be made in your identity provider."
                    ) : (
                      <>
                        The role defines the rights of a member of the
                        workspace. {ROLES_DATA[role]["description"]}
                      </>
                    )}
                  </Page.P>
                </div>

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
              </div>
            </SheetContainer>
            <SheetFooter
              rightButtonProps={{
                label: "Update role",
                onClick: handleSave,
                disabled:
                  selectedRole === member.workspace.role ||
                  isSaving ||
                  hasActiveRoleProvisioningGroups(),
                loading: isSaving,
              }}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
