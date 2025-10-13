import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  LoadingBlock,
  LockIcon,
  Page,
} from "@dust-tt/sparkle";
import type { Organization } from "@workos-inc/node";
import React from "react";

import { ToggleEnforceEnterpriseConnectionModal } from "@app/components/workspace/sso/Toggle";
import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import {
  useDisableWorkOSSSOConnection,
  useWorkOSSSOStatus,
} from "@app/lib/swr/workos";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type { PlanType, WorkspaceType } from "@app/types";

import { WorkspaceSection } from "../WorkspaceSection";

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
  const [
    isToggleEnforceEnterpriseConnectionModalOpened,
    setIsToggleEnforceEnterpriseConnectionModalOpened,
  ] = React.useState(false);

  const { ssoStatus, isLoading: isLoadingSSO } = useWorkOSSSOStatus({ owner });

  const isSSOConfigured = ssoStatus?.status === "configured";

  return (
    <WorkspaceSection title="Authentication and access" icon={LockIcon}>
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <div className="flex flex-row items-center gap-2">
            <Page.H variant="h5">Single Sign-On (SSO)</Page.H>
            {isSSOConfigured && (
              <>
                <Chip label="Enabled" color="success" size="xs" />
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
        <div className="flex justify-end gap-2">
          {isLoadingSSO ? (
            <LoadingBlock className="h-8 w-32 rounded-xl" />
          ) : isSSOConfigured ? (
            <>
              <Button
                label="Configure SSO"
                size="sm"
                variant="outline"
                onClick={() => {
                  window.open(ssoStatus?.setupLink, "_blank");
                }}
              />

              <Button
                label="De-activate SSO"
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowDisableWorkOSSSOConnectionModal(true);
                }}
              />
            </>
          ) : (
            <Button
              label="Activate SSO"
              size="sm"
              variant="primary"
              tooltip={
                domains.length === 0 ? "Add a domain to enable SSO" : undefined
              }
              disabled={
                isSSOConfigured || !domains.length || !ssoStatus?.setupLink
              }
              onClick={() => {
                if (!isUpgraded(plan)) {
                  setShowUpgradePlanDialog(true);
                } else {
                  window.open(ssoStatus?.setupLink, "_blank");
                }
              }}
            />
          )}
        </div>
      </div>
      {/* TODO(workos): Remove this once we have a clear way to enforce SSO with workos */}
      {isSSOConfigured ? (
        <div className="w-full space-y-4">
          <div className="flex flex-col space-y-4">
            <div className="flex flex-row items-center space-x-2">
              <Checkbox
                id="sso-enforced"
                checked={owner.ssoEnforced}
                onClick={async () => {
                  setIsToggleEnforceEnterpriseConnectionModalOpened(true);
                }}
              />
              <Label htmlFor="sso-enforced" className="text-md font-normal">
                Enforce SSO login
              </Label>
            </div>
            <Page.P variant="secondary">
              When SSO is enforced, users will no longer be able to use social
              logins and will be redirected to the SSO portal.
            </Page.P>
          </div>
        </div>
      ) : null}
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title="Free plan"
        description="You cannot enable SSO with the free plan. Upgrade your plan to access SSO features."
      />
      <ToggleEnforceEnterpriseConnectionModal
        isOpen={isToggleEnforceEnterpriseConnectionModalOpened}
        onClose={async (updated: boolean) => {
          setIsToggleEnforceEnterpriseConnectionModalOpened(false);

          if (updated) {
            // We perform a full refresh so that the Workspace name updates and we get a fresh owner
            // object so that the formValidation logic keeps working.
            window.location.reload();
          }
        }}
        owner={owner}
      />
      <DisableWorkOSSSOConnectionModal
        isOpen={showDisableWorkOSSSOConnectionModal}
        onClose={() => setShowDisableWorkOSSSOConnectionModal(false)}
        owner={owner}
        ssoStatus={ssoStatus}
      />
    </WorkspaceSection>
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
