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
import React from "react";

import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import {
  useDisableWorkOSDirectorySyncConnection,
  useWorkOSDSyncStatus,
} from "@app/lib/swr/workos";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type { LightWorkspaceType, PlanType } from "@app/types";
import { assertNever } from "@app/types";

function useDirectorySyncStatus({
  owner,
  plan,
}: {
  owner: LightWorkspaceType;
  plan: PlanType;
}) {
  const [showUpgradePlanDialog, setShowUpgradePlanDialog] =
    React.useState(false);
  const [showDisableDirectorySyncModal, setShowDisableDirectorySyncModal] =
    React.useState(false);

  const { dsyncStatus, isLoading: isLoadingDSync } = useWorkOSDSyncStatus({
    owner,
  });

  const handleSetupClick = React.useCallback(() => {
    if (!isUpgraded(plan)) {
      setShowUpgradePlanDialog(true);
    } else if (dsyncStatus?.setupLink) {
      window.open(dsyncStatus.setupLink, "_blank");
    }
  }, [plan, dsyncStatus?.setupLink]);

  const handleDisableClick = React.useCallback(() => {
    setShowDisableDirectorySyncModal(true);
  }, []);

  return {
    dsyncStatus,
    isLoadingDSync,
    showUpgradePlanDialog,
    setShowUpgradePlanDialog,
    showDisableDirectorySyncModal,
    setShowDisableDirectorySyncModal,
    handleSetupClick,
    handleDisableClick,
  };
}

interface DirectorySyncStatusProps {
  dsyncStatus: WorkOSConnectionSyncStatus | undefined;
  isLoadingDSync: boolean;
  onDisableClick: () => void;
  onSetupClick: () => void;
}

function DirectorySyncStatus({
  dsyncStatus,
  isLoadingDSync,
  onDisableClick,
  onSetupClick,
}: DirectorySyncStatusProps) {
  if (isLoadingDSync || !dsyncStatus) {
    return (
      <div className="flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  switch (dsyncStatus.status) {
    case "configuring":
      return (
        <>
          <div className="flex flex-row items-center gap-2">
            <div className="flex-1">
              <div className="flex flex-row items-center gap-2">
                <Page.H variant="h5">Directory sync</Page.H>
                <Chip color="success" label="Enabled" size="xs" />
              </div>
              <Page.P variant="secondary">
                Automatically syncing users and groups from{" "}
                {dsyncStatus.connection?.type}
              </Page.P>
            </div>
            <div className="flex justify-end">
              <Button
                label="De-activate Directory sync"
                size="sm"
                variant="outline"
                onClick={onDisableClick}
              />
            </div>
          </div>
        </>
      );

    case "not_configured":
      return (
        <>
          <div className="flex flex-row items-center gap-2">
            <div className="flex-1">
              <Page.H variant="h5">Directory sync</Page.H>
              <Page.P variant="secondary">
                Sync your organization's users and groups from your identity
                provider
              </Page.P>
            </div>
            <div className="flex justify-end">
              <Button
                label="Setup Directory sync"
                size="sm"
                variant="primary"
                onClick={onSetupClick}
              />
            </div>
          </div>
        </>
      );

    case "configured":
      return (
        <>
          <div className="flex flex-row items-center gap-2">
            <div className="flex-1">
              <div className="flex flex-row items-center gap-2">
                <Page.H variant="h5">Directory sync</Page.H>
                <Chip color="info" label="Setting up" size="xs" />
              </div>
              <Page.P variant="secondary">
                Configuring {dsyncStatus.connection?.type} directory sync
              </Page.P>
            </div>
            <div className="flex justify-end">
              <Button
                label="Continue setup Directory Sync"
                size="sm"
                variant="primary"
                onClick={onSetupClick}
              />
            </div>
          </div>
        </>
      );

    default:
      assertNever(dsyncStatus.status);
  }
}

interface DisableWorkOSDirectorySyncConnectionModalProps {
  isOpen: boolean;
  onClose: (updated: boolean) => void;
  owner: LightWorkspaceType;
  dsyncStatus: WorkOSConnectionSyncStatus | undefined;
}

function DisableWorkOSDirectorySyncConnectionModal({
  isOpen,
  onClose,
  owner,
  dsyncStatus,
}: DisableWorkOSDirectorySyncConnectionModalProps) {
  const { doDisableWorkOSDirectorySyncConnection } =
    useDisableWorkOSDirectorySyncConnection({
      owner,
    });

  if (!dsyncStatus?.connection) {
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
            Disable {dsyncStatus.connection.type} Directory Sync
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          Users synced through {dsyncStatus.connection.type} Directory Sync will
          no longer be automatically provisioned or deprovisioned. Existing
          users will retain their access.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: `Disable ${dsyncStatus.connection.type} Directory Sync`,
            variant: "warning",
            onClick: async () => {
              await doDisableWorkOSDirectorySyncConnection();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface UserProvisioningProps {
  owner: LightWorkspaceType;
  plan: PlanType;
}

export default function UserProvisioning({
  owner,
  plan,
}: UserProvisioningProps) {
  const {
    dsyncStatus,
    isLoadingDSync,
    showUpgradePlanDialog,
    setShowUpgradePlanDialog,
    showDisableDirectorySyncModal,
    setShowDisableDirectorySyncModal,
    handleSetupClick,
    handleDisableClick,
  } = useDirectorySyncStatus({ owner, plan });

  return (
    <Page.Vertical gap="lg">
      <Page.H variant="h4">User provisionning</Page.H>
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <DirectorySyncStatus
            dsyncStatus={dsyncStatus}
            isLoadingDSync={isLoadingDSync}
            onSetupClick={handleSetupClick}
            onDisableClick={handleDisableClick}
          />
        </div>
      </div>
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title="Free plan"
        description="You cannot enable SSO with the free plan. Upgrade your plan to access SSO features."
      />
      <DisableWorkOSDirectorySyncConnectionModal
        isOpen={showDisableDirectorySyncModal}
        onClose={() => setShowDisableDirectorySyncModal(false)}
        owner={owner}
        dsyncStatus={dsyncStatus}
      />
    </Page.Vertical>
  );
}
