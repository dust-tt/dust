import {
  Button,
  ContentMessage,
  ExternalLinkIcon,
  Page,
  Spinner,
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
      return null;
    }

    return (
      <Page.Vertical>
        <Page.Vertical>
          <Page.H variant="h6">Single Sign-On (SSO)</Page.H>
          <Page.P variant="secondary">
            {!ssoStatus || ssoStatus.status === "not_configured"
              ? "Configure SSO to enable secure authentication for your organization."
              : ssoStatus.status === "configured"
                ? `Connected to ${ssoStatus.connection?.type}`
                : `Configuring ${ssoStatus.connection?.type}...`}
          </Page.P>
          {(!ssoStatus || ssoStatus.status !== "configured") && (
            <Button
              variant="primary"
              onClick={() => handleOpenPortal(WorkOSPortalIntent.SSO)}
              label={
                ssoStatus?.status === "configuring"
                  ? "Continue SSO Setup"
                  : "Configure SSO"
              }
              icon={ExternalLinkIcon}
            />
          )}
        </Page.Vertical>
        {ssoStatus?.status === "configuring" && (
          <ContentMessage
            title="Configuration in progress"
            variant="primary"
            icon={Spinner}
          >
            SSO configuration is in progress. Click to continue setup.
          </ContentMessage>
        )}
      </Page.Vertical>
    );
  };

  const renderDSyncSection = () => {
    if (isLoadingDSync) {
      return null;
    }

    return (
      <Page.Vertical>
        <Page.Vertical>
          <div>
            <Page.H variant="h6">Directory Sync</Page.H>
            <Page.P variant="secondary">
              {!dsyncStatus || dsyncStatus.status === "not_configured"
                ? "Sync your organization's users and groups from your identity provider."
                : dsyncStatus.status === "configured"
                  ? `Syncing with ${dsyncStatus.connection?.type}`
                  : `Configuring ${dsyncStatus.connection?.type}...`}
            </Page.P>
          </div>
          {(!dsyncStatus || dsyncStatus.status !== "configured") && (
            <Button
              variant="primary"
              onClick={() => handleOpenPortal(WorkOSPortalIntent.DSync)}
              label={
                dsyncStatus?.status === "configuring"
                  ? "Continue Directory Sync Setup"
                  : "Configure Directory Sync"
              }
              icon={ExternalLinkIcon}
            />
          )}
        </Page.Vertical>
        {dsyncStatus?.status === "configuring" && (
          <ContentMessage
            title="Configuration in progress"
            variant="primary"
            icon={Spinner}
          >
            Directory Sync configuration is in progress. Click to continue
            setup.
          </ContentMessage>
        )}
        {dsyncStatus?.status === "configured" && (
          <WorkOSSyncButton owner={owner} />
        )}
      </Page.Vertical>
    );
  };

  return (
    <Page.Vertical gap="lg">
      <Page.H variant="h5">Enterprise Connection</Page.H>
      <Page.P variant="secondary">
        {owner.workOSOrganizationId
          ? "Manage your enterprise Identity Provider (IdP) settings and user provisioning."
          : "Your WorkOS organization will be automatically created when your is upgraded to an eligible plan."}
      </Page.P>
      {owner.workOSOrganizationId && (
        <Page.Vertical gap="lg">
          {renderSSOSection()}
          {renderDSyncSection()}
        </Page.Vertical>
      )}
    </Page.Vertical>
  );
}
