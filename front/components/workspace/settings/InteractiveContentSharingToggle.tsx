import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
import type { WorkspaceSharingPolicy, WorkspaceType } from "@app/types/user";
import {
  ActionFrameIcon,
  Button,
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
    label: "Workspace members only",
    description: "Frames can only be viewed by workspace members",
    value: "workspace_only",
  },
  {
    icon: UserGroupIcon,
    label: "Members + email invites",
    description:
      "Frames can be shared with workspace members or via email invite",
    value: "workspace_and_emails",
  },
  {
    icon: GlobeAltIcon,
    label: "No restrictions",
    description:
      "Members can share Frames publicly, with the workspace, or via email invite",
    value: "all_scopes",
  },
];

interface InteractiveContentSharingToggleProps {
  owner: WorkspaceType;
}

export function InteractiveContentSharingToggle({
  owner,
}: InteractiveContentSharingToggleProps) {
  const { isChanging, sharingPolicy, doUpdateSharingPolicy } =
    useFrameSharingToggle({ owner });
  const [pendingPolicy, setPendingPolicy] =
    useState<WorkspaceSharingPolicy | null>(null);

  const selectedOption = SHARING_POLICY_OPTIONS.find(
    (o) => o.value === sharingPolicy
  );

  const handlePolicyChange = (newPolicy: WorkspaceSharingPolicy) => {
    // Downgrading from all_scopes (revokes public links) or switching to
    // workspace_only (blocks existing email invitees) requires confirmation.
    if (
      (sharingPolicy === "all_scopes" && newPolicy !== "all_scopes") ||
      newPolicy === "workspace_only"
    ) {
      setPendingPolicy(newPolicy);
    } else {
      void doUpdateSharingPolicy(newPolicy);
    }
  };

  const isRestrictingToWorkspaceOnly = pendingPolicy === "workspace_only";
  const isDowngradingFromAllScopes =
    sharingPolicy === "all_scopes" && pendingPolicy !== null;

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
            <DropdownMenuContent className="max-w-[400px]" align="end">
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
            <DialogTitle>
              {isRestrictingToWorkspaceOnly
                ? "Block external access"
                : "Restrict Frame sharing"}
            </DialogTitle>
            <DialogDescription>
              {isRestrictingToWorkspaceOnly ? (
                <>
                  Non-workspace members with email invites will immediately lose
                  access to all frames in this workspace. Their invites are
                  preserved and will resume if you change this setting later.
                  {isDowngradingFromAllScopes &&
                    " Public links will also stop working."}
                </>
              ) : (
                <>
                  This will revoke public access to all currently shared frames
                  in this workspace. Existing public links will stop working.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              disabled: isChanging,
              variant: "outline",
            }}
            rightButtonProps={{
              label: isRestrictingToWorkspaceOnly
                ? "Block external access"
                : "Restrict sharing",
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
