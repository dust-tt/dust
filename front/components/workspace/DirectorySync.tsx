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
  Page,
  Separator,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Spinner,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import React, { useState } from "react";

import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useGroups } from "@app/lib/swr/groups";
import {
  useDisableWorkOSDirectorySyncConnection,
  useWorkOSDSyncStatus,
} from "@app/lib/swr/workos";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type { LightWorkspaceType, PlanType, WorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

import { GroupsList } from "../groups/GroupsList";
import { WorkspaceSection } from "./WorkspaceSection";

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
  owner: WorkspaceType;
  dsyncStatus: WorkOSConnectionSyncStatus | undefined;
  isLoadingDSync: boolean;
  onDisableClick: () => void;
  onSetupClick: () => void;
}

function DirectorySyncStatus({
  owner,
  dsyncStatus,
  isLoadingDSync,
  onDisableClick,
  onSetupClick,
}: DirectorySyncStatusProps) {
  if (isLoadingDSync || !dsyncStatus) {
    return <LoadingBlock className="h-16 w-full rounded-xl" />;
  }

  switch (dsyncStatus.status) {
    case "configured":
      return (
        <>
          <div className="mb-4 flex flex-row items-center gap-2">
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
            <div className="flex justify-end gap-2">
              <Button
                label="Configure Directory sync"
                size="sm"
                variant="outline"
                onClick={onSetupClick}
              />
              <Button
                label="De-activate Directory sync"
                size="sm"
                variant="outline"
                onClick={onDisableClick}
              />
            </div>
          </div>
          <WorkspaceGroupButtonWithModal owner={owner} />
        </>
      );

    case "not_configured":
      return (
        <>
          <div className="mb-3 flex flex-row items-center gap-2">
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

    case "configuring":
      return (
        <>
          <div className="flex flex-row items-center gap-2">
            <div className="flex-1">
              <div className="flex flex-row items-center gap-2">
                <Page.H variant="h5">User Provisioning</Page.H>
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
    <WorkspaceSection title="User provisioning" icon={UserGroupIcon}>
      <div className="flex w-full flex-row items-center gap-2">
        <div className="flex-1">
          <DirectorySyncStatus
            owner={owner}
            dsyncStatus={dsyncStatus}
            isLoadingDSync={isLoadingDSync}
            onSetupClick={handleSetupClick}
            onDisableClick={handleDisableClick}
          />
        </div>
      </div>
      <Separator />
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
    </WorkspaceSection>
  );
}

interface WorkspaceGroupButtonWithModalProps {
  owner: WorkspaceType;
}

const DEFAULT_PAGE_SIZE = 25;

function WorkspaceGroupButtonWithModal({
  owner,
}: WorkspaceGroupButtonWithModalProps) {
  const [open, setOpen] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: ["provisioned"],
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
      }}
    >
      <SheetTrigger asChild>
        <Button icon={UserGroupIcon} label="View groups" />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Workspace Groups</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex grow flex-col gap-4">
            {isGroupsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : groups.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                No groups found in this workspace.
              </div>
            ) : (
              <GroupsList
                isLoading={isGroupsLoading}
                groups={groups}
                showColumns={["name", "memberCount"]}
                pagination={pagination}
                setPagination={setPagination}
              />
            )}
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
