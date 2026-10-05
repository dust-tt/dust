import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import type { WorkspaceSharingPolicy } from "@app/types/user";
import {
  Button,
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
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

const SHARING_POLICY_OPTIONS: {
  description: MessageDescriptor;
  label: MessageDescriptor;
  value: WorkspaceSharingPolicy;
}[] = [
  {
    label: msg`Workspace members only`,
    description: msg`Frames can only be viewed by workspace members`,
    value: "workspace_only",
  },
  {
    label: msg`Members + email invites`,
    description: msg`Frames can be shared with workspace members or via email invite`,
    value: "workspace_and_emails",
  },
  {
    label: msg`No restrictions`,
    description: msg`Members can share frames publicly, with the workspace, or via email invite`,
    value: "all_scopes",
  },
];

interface InteractiveContentSharingProps {
  isChanging: boolean;
  sharingPolicy: WorkspaceSharingPolicy;
  doUpdateSharingPolicy: (policy: WorkspaceSharingPolicy) => Promise<void>;
}

export function InteractiveContentSharing({
  isChanging,
  sharingPolicy,
  doUpdateSharingPolicy,
}: InteractiveContentSharingProps) {
  const { t } = useLingui();
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
      <GovernanceSettingRowLayout
        label={t`Frame sharing`}
        description={t`Whether frames are shareable outside the workspace`}
        action={
          <InteractiveContentSharingDropdown
            selectedOption={selectedOption}
            onPolicyChange={handlePolicyChange}
            isChanging={isChanging}
            sharingPolicy={sharingPolicy}
          />
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
                ? t`Block external access`
                : t`Restrict Frame sharing`}
            </DialogTitle>
            <DialogDescription>
              {isRestrictingToWorkspaceOnly ? (
                <>
                  <Trans>
                    Non-workspace members with email invites will lose access to
                    all frames in this workspace. Their invites are preserved
                    and will resume if you change this setting later.
                  </Trans>
                  {isDowngradingFromAllScopes && (
                    <>
                      {" "}
                      <Trans>Public links will also stop working.</Trans>
                    </>
                  )}
                </>
              ) : (
                <Trans>
                  This will revoke public access to all currently shared frames
                  in this workspace. Existing public links will stop working.
                </Trans>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: t`Cancel`,
              disabled: isChanging,
              variant: "outline",
            }}
            rightButtonProps={{
              label: isRestrictingToWorkspaceOnly
                ? t`Block external access`
                : t`Restrict sharing`,
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

interface InteractiveContentSharingDropdownProps {
  selectedOption?: {
    label: MessageDescriptor;
  };
  isChanging: boolean;
  sharingPolicy: WorkspaceSharingPolicy;
  onPolicyChange: (newPolicy: WorkspaceSharingPolicy) => void;
}

const InteractiveContentSharingDropdown = ({
  selectedOption,
  isChanging,
  sharingPolicy,
  onPolicyChange,
}: InteractiveContentSharingDropdownProps) => {
  const { t } = useLingui();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          isSelect
          label={selectedOption ? t(selectedOption.label) : undefined}
          disabled={isChanging}
          className="grid grid-cols-[auto_1fr_auto] truncate"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-100" align="end">
        <DropdownMenuRadioGroup value={sharingPolicy}>
          {SHARING_POLICY_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              label={t(option.label)}
              description={t(option.description)}
              onClick={() => onPolicyChange(option.value)}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
