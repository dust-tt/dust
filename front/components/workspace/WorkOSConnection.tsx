import {
  Button,
  ExternalLinkIcon,
  Page,
  Spinner,
  Card,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import {
  useWorkOSAdminPortalUrl,
  useWorkOSDSyncStatus,
  useWorkOSSSOStatus,
} from "@app/lib/swr/workos";
import { useSyncWorkOSDirectoriesAndUsers } from "@app/lib/swr/workspaces";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import type { WorkspaceType } from "@app/types";

interface WorkOSSyncButtonProps {
  owner: WorkspaceType;
}

export function WorkOSSyncButton({ owner }: WorkOSSyncButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { triggerFullSync } = useSyncWorkOSDirectoriesAndUsers(owner);

  const handleSync = async () => {
    setIsLoading(true);
    await triggerFullSync();
    setIsLoading(false);
  };

  return (
    <Button
      variant="primary"
      onClick={handleSync}
      disabled={isLoading}
      label={isLoading ? "Syncing..." : "Sync WorkOS Directories & Groups"}
    />
  );
}

interface WorkOSConnectionProps {
  owner: WorkspaceType;
}

export function WorkOSConnection({ owner }: WorkOSConnectionProps) {
  const [selectedIntent, setSelectedIntent] = useState<WorkOSPortalIntent>(
    WorkOSPortalIntent.DomainVerification
  );
  const [shouldOpenPortal, setShouldOpenPortal] = useState(false);

  const { adminPortalUrl } = useWorkOSAdminPortalUrl(owner.sId, selectedIntent);
  const { ssoStatus, isLoading: isLoadingSSO } = useWorkOSSSOStatus(owner.sId);
  const { dsyncStatus, isLoading: isLoadingDSync } = useWorkOSDSyncStatus(
    owner.sId
  );

  useEffect(() => {
    if (adminPortalUrl && shouldOpenPortal) {
      window.open(adminPortalUrl, "_blank");
      setShouldOpenPortal(false);
    }
  }, [adminPortalUrl, shouldOpenPortal]);

  const handleOpenPortal = (intent: WorkOSPortalIntent) => {
    setSelectedIntent(intent);
    setShouldOpenPortal(true);
  };

  const renderSSOSection = () => {
    if (isLoadingSSO) {
      return (
        <Card>
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span>Loading SSO status...</span>
          </div>
        </Card>
      );
    }

    if (!ssoStatus) {
      return (
        <Card>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <Page.H variant="h6">Single Sign-On (SSO)</Page.H>
                <Page.P variant="secondary">
                  Configure SSO to enable secure authentication for your
                  organization.
                </Page.P>
              </div>
              <Button
                variant="primary"
                onClick={() => handleOpenPortal(WorkOSPortalIntent.SSO)}
                label="Configure SSO"
                icon={ExternalLinkIcon}
              />
            </div>
          </div>
        </Card>
      );
    }

    return (
      <Card>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <Page.H variant="h6">Single Sign-On (SSO)</Page.H>
              <Page.P variant="secondary">
                {ssoStatus.status === "configured"
                  ? `Connected to ${ssoStatus.connection?.type}`
                  : ssoStatus.status === "configuring"
                    ? `Configuring ${ssoStatus.connection?.type}...`
                    : "Not configured"}
              </Page.P>
            </div>
            <Button
              variant={
                ssoStatus.status === "configured" ? "tertiary" : "primary"
              }
              onClick={() => handleOpenPortal(WorkOSPortalIntent.SSO)}
              label={
                ssoStatus.status === "configured"
                  ? "Manage SSO"
                  : "Configure SSO"
              }
              icon={ExternalLinkIcon}
            />
          </div>
          {ssoStatus.status === "configuring" && (
            <div className="mt-2 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span>
                  SSO configuration is in progress. Click to continue setup.
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  };

  const renderDSyncSection = () => {
    if (isLoadingDSync) {
      return (
        <Card>
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span>Loading Directory Sync status...</span>
          </div>
        </Card>
      );
    }

    if (!dsyncStatus) {
      return (
        <Card>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <Page.H variant="h6">Directory Sync</Page.H>
                <Page.P variant="secondary">
                  Sync your organization's users and groups from your identity
                  provider.
                </Page.P>
              </div>
              <Button
                variant="primary"
                onClick={() => handleOpenPortal(WorkOSPortalIntent.DSync)}
                label="Configure Directory Sync"
                icon={ExternalLinkIcon}
              />
            </div>
          </div>
        </Card>
      );
    }

    const directory = dsyncStatus.connection;
    const isConfiguring = dsyncStatus.status === "configuring";

    return (
      <Card>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <Page.H variant="h6">Directory Sync</Page.H>
              <Page.P variant="secondary">
                {dsyncStatus.status === "configured"
                  ? `Syncing with ${directory?.type}`
                  : isConfiguring
                    ? `Configuring ${directory?.type}...`
                    : "Not configured"}
              </Page.P>
            </div>
            <Button
              variant={
                dsyncStatus.status === "configured" ? "tertiary" : "primary"
              }
              onClick={() => handleOpenPortal(WorkOSPortalIntent.DSync)}
              label={
                dsyncStatus.status === "configured"
                  ? "Manage Directory Sync"
                  : "Configure Directory Sync"
              }
              icon={ExternalLinkIcon}
            />
          </div>
          {isConfiguring && (
            <div className="mt-2 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span>
                  Directory sync configuration is in progress. Click to continue
                  setup.
                </span>
              </div>
            </div>
          )}
          {dsyncStatus.status === "configured" && (
            <div className="mt-2">
              <WorkOSSyncButton owner={owner} />
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <Page.Vertical gap="sm">
      <Page.H variant="h5">Enterprise Connection</Page.H>
      <Page.P variant="secondary">
        {owner.workOSOrganizationId
          ? "Manage your enterprise Identity Provider (IdP) settings and user provisioning."
          : "Your WorkOS organization will be automatically created when your is upgraded to an eligible plan."}
      </Page.P>
      {owner.workOSOrganizationId && (
        <Page.Horizontal gap="sm">
          {renderSSOSection()}
          {renderDSyncSection()}
        </Page.Horizontal>
      )}
    </Page.Vertical>
  );
}
