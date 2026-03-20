import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
import type { WorkspaceSharingPolicy, WorkspaceType } from "@app/types/user";
import {
  ActionFrameIcon,
  ContextItem,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  GlobeAltIcon,
  LockIcon,
  UserGroupIcon,
  Button,
} from "@dust-tt/sparkle";
import { useState } from "react";

const SHARING_POLICY_OPTIONS: {
  description: string;
  icon: typeof LockIcon;
  label: string;
  value: WorkspaceSharingPolicy;
}[] = [
  {
    icon: LockIcon,
    label: "Email invites only",
    description: "Frames can only be shared via email invite",
    value: "emails_only",
  },
  {
    icon: UserGroupIcon,
    label: "Members + email invites",
    description: "Frames are visible to all members and anyone invited by email",
    value: "workspace_and_emails",
  },
  {
    icon: GlobeAltIcon,
    label: "No restrictions",
    description: "Frames can be shared publicly, with members, or by email",
    value: "all_scopes",
  },
];

export function InteractiveContentSharingToggle({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const { isChanging, sharingPolicy, doUpdateSharingPolicy } =
    useFrameSharingToggle({ owner });
  const [pendingPolicy, setPendingPolicy] =
    useState<WorkspaceSharingPolicy | null>(null);

  const selectedOption = SHARING_POLICY_OPTIONS.find(
    (o) => o.value === sharingPolicy
  );

  const handlePolicyChange = (newPolicy: WorkspaceSharingPolicy) => {
    // Downgrading from all_scopes requires confirmation (revokes public links).
    if (sharingPolicy === "all_scopes" && newPolicy !== "all_scopes") {
      setPendingPolicy(newPolicy);
    } else {
      void doUpdateSharingPolicy(newPolicy);
    }
  };

  return (
    <>
      <ContextItem
        title="Frame sharing policy"
        subElement="Control how Frames can be shared in this workspace"
        visual={<ActionFrameIcon className="h-6 w-6" />}
        hasSeparatorIfLast={true}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                isSelect
                label={selectedOption?.label}
                icon={selectedOption?.icon}
                disabled={isChanging}
                className="grid grid-cols-[auto_1fr_auto] truncate"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup value={sharingPolicy}>
                {SHARING_POLICY_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    description={option.description}
                    icon={option.icon}
                    onClick={() => handlePolicyChange(option.value)}
                  />
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <Dialog
        open={!!pendingPolicy}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPolicy(null);
          }
        }}
      >
        <DialogContent size="md" isAlertDialog>
          <DialogHeader hideButton>
            <DialogTitle>Restrict Frame sharing</DialogTitle>
            <DialogDescription>
              This will revoke public access to all currently shared Frames in
              this workspace. Existing public links will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              disabled: isChanging,
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Restrict sharing",
              disabled: isChanging,
              variant: "warning",
              onClick: async () => {
                if (pendingPolicy) {
                  await doUpdateSharingPolicy(pendingPolicy);
                }
                setPendingPolicy(null);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
