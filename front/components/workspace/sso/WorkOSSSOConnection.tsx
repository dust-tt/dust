import {
  Button,
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type { Organization } from "@workos-inc/node";
import React from "react";

import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import {
  useDisableWorkOSSSOConnection,
  useWorkOSSSOStatus,
} from "@app/lib/swr/workos";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type { PlanType, WorkspaceType } from "@app/types";

interface WorkOSSSOConnectionProps {
  domains: Organization["domains"];
  owner: WorkspaceType;
  plan: PlanType;
}

export default function WorkOSSSOConnection({
  domains,
  owner,
  plan,
}: WorkOSSSOConnectionProps) {
  const [showUpgradePlanDialog, setShowUpgradePlanDialog] =
    React.useState(false);
  const [
    showDisableWorkOSSSOConnectionModal,
    setShowDisableWorkOSSSOConnectionModal,
  ] = React.useState(false);

  const {
    ssoStatus,
    isLoading: isLoadingSSO,
    setupSSOLink,
  } = useWorkOSSSOStatus({ owner });

  const isSSOConfigured = ssoStatus?.status === "configured";

  return (
    <Page.Vertical gap="sm">
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <div className="flex flex-row items-center gap-2">
            <Page.H variant="h5">Single Sign-On (SSO)</Page.H>
            {isSSOConfigured && (
              <>
                <Chip label="Enabled" color="green" size="sm" />
                <span className="text-base font-normal text-muted-foreground dark:text-muted-foreground-night">
                  {ssoStatus.connection?.type}
                </span>
              </>
            )}
          </div>
          <Page.P variant="secondary">
            Manage your enterprise Identity Provider (IdP) settings and user
            provisioning via WorkOS.
          </Page.P>
        </div>
        {isLoadingSSO ? (
          <Spinner size="lg" />
        ) : (
          <div className="flex justify-end">
            {isSSOConfigured ? (
              <Button
                label="De-activate SSO"
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowDisableWorkOSSSOConnectionModal(true);
                }}
              />
            ) : (
              <Button
                label="Activate SSO"
                size="sm"
                variant="primary"
                tooltip={
                  domains.length === 0
                    ? "Add a domain to enable SSO"
                    : undefined
                }
                disabled={isSSOConfigured || !domains.length}
                onClick={() => {
                  if (!isUpgraded(plan)) {
                    setShowUpgradePlanDialog(true);
                  } else {
                    window.open(setupSSOLink, "_blank");
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title="Free plan"
        description="You cannot enable SSO with the free plan. Upgrade your plan to access SSO features."
      />
      <DisableWorkOSSSOConnectionModal
        isOpen={showDisableWorkOSSSOConnectionModal}
        onClose={() => setShowDisableWorkOSSSOConnectionModal(false)}
        owner={owner}
        ssoStatus={ssoStatus}
      />
    </Page.Vertical>
  );
}

interface DisableWorkOSSSOConnectionModalProps {
  isOpen: boolean;
  onClose: (updated: boolean) => void;
  owner: WorkspaceType;
  ssoStatus: WorkOSConnectionSyncStatus | undefined;
}

function DisableWorkOSSSOConnectionModal({
  isOpen,
  onClose,
  owner,
  ssoStatus,
}: DisableWorkOSSSOConnectionModalProps) {
  const { doDisableWorkOSSSOConnection } = useDisableWorkOSSSOConnection({
    owner,
  });

  if (!ssoStatus?.connection) {
    return <></>;
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose(false);
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            Disable {ssoStatus.connection.type} Single Sign On
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          Anyone with an {ssoStatus.connection.type} account won't be able to
          access your Dust workspace anymore.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: `Disable ${ssoStatus.connection.type} Single Sign On`,
            variant: "warning",
            onClick: async () => {
              await doDisableWorkOSSSOConnection();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
