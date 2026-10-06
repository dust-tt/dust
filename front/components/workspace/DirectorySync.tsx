import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useGroups } from "@app/lib/swr/groups";
import {
  useDisableWorkOSDirectorySyncConnection,
  useWorkOSDSyncStatus,
} from "@app/lib/swr/workos";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import type { PlanType } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
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
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Spinner,
  Users01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PaginationState } from "@tanstack/react-table";
import React, { useState } from "react";

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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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
  const { t } = useLingui();
  if (isLoadingDSync || !dsyncStatus) {
    return <LoadingBlock className="h-16 w-full rounded-xl" />;
  }

  switch (dsyncStatus.status) {
    case "configured": {
      const connectionType = dsyncStatus.connection?.type;
      return (
        <>
          <div className="mb-4 flex flex-row items-center gap-2">
            <div className="flex-1">
              <div className="flex flex-row items-center gap-2">
                <Page.H variant="h5">
                  <Trans>Directory sync</Trans>
                </Page.H>
                <Chip color="success" label={t`Enabled`} size="xs" />
              </div>
              <Page.P variant="secondary">
                <Trans>
                  Automatically syncing users and groups from {connectionType}
                </Trans>
              </Page.P>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                label={t`Configure Directory sync`}
                size="sm"
                variant="outline"
                onClick={onSetupClick}
              />
              <Button
                label={t`Deactivate Directory sync`}
                size="sm"
                variant="outline"
                onClick={onDisableClick}
              />
            </div>
          </div>
          <WorkspaceGroupButtonWithModal owner={owner} />
        </>
      );
    }

    case "not_configured":
      return (
        <>
          <div className="mb-3 flex flex-row items-center gap-2">
            <div className="flex-1">
              <Page.H variant="h5">
                <Trans>Directory sync</Trans>
              </Page.H>
              <Page.P variant="secondary">
                <Trans>
                  Sync your organization's users and groups from your identity
                  provider
                </Trans>
              </Page.P>
            </div>
            <div className="flex justify-end">
              <Button
                label={t`Set up Directory sync`}
                size="sm"
                variant="primary"
                onClick={onSetupClick}
              />
            </div>
          </div>
        </>
      );

    case "configuring": {
      const connectionType = dsyncStatus.connection?.type;
      return (
        <>
          <div className="flex flex-row items-center gap-2">
            <div className="flex-1">
              <div className="flex flex-row items-center gap-2">
                <Page.H variant="h5">
                  <Trans>User provisioning</Trans>
                </Page.H>
                <Chip color="info" label={t`Setting up`} size="xs" />
              </div>
              <Page.P variant="secondary">
                <Trans>Configuring {connectionType} directory sync</Trans>
              </Page.P>
            </div>
            <div className="flex justify-end">
              <Button
                label={t`Continue setting up Directory Sync`}
                size="sm"
                variant="primary"
                onClick={onSetupClick}
              />
            </div>
          </div>
        </>
      );
    }

    default:
      assertNeverAndIgnore(dsyncStatus.status);
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
  const { t } = useLingui();
  const { doDisableWorkOSDirectorySyncConnection } =
    useDisableWorkOSDirectorySyncConnection({
      owner,
    });

  if (!dsyncStatus?.connection) {
    return <></>;
  }

  const connectionType = dsyncStatus.connection.type;

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
            <Trans>Disable {connectionType} Directory Sync</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Trans>
            Users synced through {connectionType} Directory Sync will no longer
            be automatically provisioned or deprovisioned. Existing users will
            retain their access.
          </Trans>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Disable ${connectionType} Directory Sync`,
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
  const { t } = useLingui();
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
    <WorkspaceSection
      title={t`User provisioning`}
      icon={Users01}
      sectionId={ADMIN_SECTION_IDS.identity.provisioning}
    >
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
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title={t`Free plan`}
        description={t`You cannot enable SSO with the free plan. Upgrade your plan to access SSO features.`}
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
  const { t } = useLingui();
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
        <Button icon={Users01} label={t`View groups`} />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            <Trans>Workspace Groups</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex grow flex-col gap-4">
            {isGroupsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : groups.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Trans>No groups found in this workspace.</Trans>
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
