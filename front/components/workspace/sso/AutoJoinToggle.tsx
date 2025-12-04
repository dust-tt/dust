import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
} from "@dust-tt/sparkle";
import type { Organization } from "@workos-inc/node";
import { useState } from "react";

import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import type { PlanType, WorkspaceDomain, WorkspaceType } from "@app/types";
import { pluralize } from "@app/types";

type DomainAutoJoinModalProps = {
  domains: Organization["domains"];
  domainAutoJoinEnabled: boolean;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
};

function DomainAutoJoinModal({
  domains,
  domainAutoJoinEnabled,
  isOpen,
  onClose,
  owner,
}: DomainAutoJoinModalProps) {
  const sendNotification = useSendNotification();
  const title = domainAutoJoinEnabled
    ? "De-activate Auto-join"
    : "Activate Auto-join";
  const validateLabel = domainAutoJoinEnabled ? "De-activate" : "Activate";
  const validateVariant = domainAutoJoinEnabled ? "warning" : "primary";
  const description = domainAutoJoinEnabled ? (
    "New members will need to be invited in order to gain access to your Dust Workspace."
  ) : (
    <span>
      Anyone with Google{" "}
      <span className="font-bold">
        {domains.map((d) => `"@${d.domain}"`).join(", ")}
      </span>{" "}
      account will have access to your Dust Workspace.
    </span>
  );

  async function handleUpdateWorkspace(): Promise<void> {
    const res = await clientFetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domainAutoJoinEnabled: !domainAutoJoinEnabled,
      }),
    });

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Update failed",
        description: `Failed to enable auto-add for whitelisted domain.`,
      });
    } else {
      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogContainer>{description}</DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: validateLabel,
            variant: validateVariant,
            onClick: async () => {
              await handleUpdateWorkspace();
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

type AutoJoinToggleProps = {
  domains: Organization["domains"];
  workspaceVerifiedDomains: WorkspaceDomain[];
  owner: WorkspaceType;
  plan: PlanType;
};

export function AutoJoinToggle({
  domains,
  workspaceVerifiedDomains,
  owner,
  plan,
}: AutoJoinToggleProps) {
  const [showUpgradePlanDialog, setShowUpgradePlanDialog] = useState(false);
  const [isActivateAutoJoinOpened, setIsActivateAutoJoinOpened] =
    useState(false);
  const domainAutoJoinEnabled =
    workspaceVerifiedDomains.length > 0 &&
    workspaceVerifiedDomains.every((d) => d.domainAutoJoinEnabled);

  return (
    <>
      <DomainAutoJoinModal
        domainAutoJoinEnabled={domainAutoJoinEnabled}
        isOpen={isActivateAutoJoinOpened}
        onClose={() => {
          setIsActivateAutoJoinOpened(false);
        }}
        domains={domains}
        owner={owner}
      />
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title="Free plan"
        description="You cannot enable auto-join with the free plan. Upgrade your plan to invite other members."
      />
      <Page.Vertical>
        <div className="flex w-full flex-row items-center gap-2">
          <div className="flex-1">
            <div className="flex flex-row items-center gap-2">
              <Page.H variant="h5">Auto-join Workspace</Page.H>
            </div>
            <Page.P variant="secondary">
              Allow your team members to access your Dust workspace when they
              authenticate with
              {domains.length > 0
                ? domains.map((d) => `" @${d.domain}"`).join(", ")
                : " verified"}{" "}
              account
              {pluralize(domains.length)}.
            </Page.P>
          </div>
          <div className="flex justify-end">
            {domainAutoJoinEnabled ? (
              <Button
                label="De-activate Auto-join"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (isUpgraded(plan)) {
                    setIsActivateAutoJoinOpened(true);
                  } else {
                    setShowUpgradePlanDialog(true);
                  }
                }}
              />
            ) : (
              <Button
                label="Activate Auto-join"
                size="sm"
                variant="primary"
                tooltip={
                  domains.length === 0
                    ? "Add a domain to enable Auto-join"
                    : undefined
                }
                disabled={!domains.length}
                onClick={() => {
                  if (isUpgraded(plan)) {
                    setIsActivateAutoJoinOpened(true);
                  } else {
                    setShowUpgradePlanDialog(true);
                  }
                }}
              />
            )}
          </div>
        </div>
      </Page.Vertical>
    </>
  );
}
