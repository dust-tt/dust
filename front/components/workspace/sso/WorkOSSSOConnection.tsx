import { ToggleEnforceEnterpriseConnectionModal } from "@app/components/workspace/sso/Toggle";
import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import {
  useDisableWorkOSSSOConnection,
  useWorkOSSSOStatus,
} from "@app/lib/swr/workos";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type { PlanType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingBlock,
  SettingsList,
  SliderToggle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Organization } from "@workos-inc/node";
import React from "react";

import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";

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
  const { t } = useLingui();
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
    <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.identity.sso}>
      <span className="heading-base text-foreground">
        <Trans>Authentication and access</Trans>
      </span>
      <SettingsList>
        <SettingsList.Row
          title={
            <>
              <Trans>Single Sign-On (SSO)</Trans>{" "}
              {isSSOConfigured && (
                <>
                  <Chip label={t`Enabled`} color="success" size="xs" />
                  <span className="text-base font-normal text-muted-foreground">
                    {ssoStatus.connection?.type}
                  </span>
                </>
              )}
            </>
          }
          description={
            <Trans>
              Manage your enterprise Identity Provider (IdP) settings and user
              provisioning via WorkOS.
            </Trans>
          }
          action={
            <div className="flex justify-end gap-2">
              {isLoadingSSO ? (
                <LoadingBlock className="h-8 w-32 rounded-xl" />
              ) : isSSOConfigured ? (
                <>
                  <Button
                    label={t`Configure SSO`}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(ssoStatus?.setupLink, "_blank");
                    }}
                  />

                  <Button
                    label={t`De-activate SSO`}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowDisableWorkOSSSOConnectionModal(true);
                    }}
                  />
                </>
              ) : (
                <Button
                  label={t`Activate SSO`}
                  size="sm"
                  variant="primary"
                  tooltip={
                    domains.length === 0
                      ? t`Add a domain to enable SSO`
                      : undefined
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
          }
        />
        {/* TODO(workos): Remove this once we have a clear way to enforce SSO with workos */}
        {isSSOConfigured ? (
          <SettingsList.Row
            title={<Trans>Enforce SSO login</Trans>}
            description={
              <Trans>
                When SSO is enforced, users will no longer be able to use social
                logins and will be redirected to the SSO portal.
              </Trans>
            }
            action={
              <SliderToggle
                selected={owner.ssoEnforced}
                onClick={async () => {
                  setIsToggleEnforceEnterpriseConnectionModalOpened(
                    !owner.ssoEnforced
                  );
                }}
              />
            }
          />
        ) : null}
      </SettingsList>
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title={t`Free plan`}
        description={t`You cannot enable SSO with the free plan. Upgrade your plan to access SSO features.`}
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
    </AdminSectionAnchor>
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
  const { t } = useLingui();
  const { doDisableWorkOSSSOConnection } = useDisableWorkOSSSOConnection({
    owner,
  });

  if (!ssoStatus?.connection) {
    return <></>;
  }

  const connectionType = ssoStatus.connection.type;

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
            <Trans>Disable {connectionType} Single Sign On</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Trans>
            Anyone with an {connectionType} account won't be able to access your
            Dust workspace anymore.
          </Trans>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Disable ${connectionType} Single Sign On`,
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
