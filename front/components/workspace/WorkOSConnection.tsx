import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  ExternalLinkIcon,
  Page,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import {
  useCreateWorkOSOrganization,
  useWorkOSAdminPortalUrl,
} from "@app/lib/swr/workos";
import { useSyncWorkOSDirectoriesAndUsers } from "@app/lib/swr/workspaces";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import type { WorkspaceType } from "@app/types";

const ADMIN_PANEL_OPTIONS = {
  domain: [
    {
      value: WorkOSPortalIntent.DomainVerification,
      label: "Domain Verification",
      description:
        "Verify your organization's domain for SSO and email domain matching",
    },
  ],
  config: [
    {
      value: WorkOSPortalIntent.SSO,
      label: "SSO Settings",
      description: "Configure Single Sign-On (SSO) with your identity provider",
    },
    {
      value: WorkOSPortalIntent.DSync,
      label: "Directory Sync",
      description:
        "Set up and manage directory synchronization with your identity provider",
    },
  ],
  logs: [
    {
      value: WorkOSPortalIntent.AuditLogs,
      label: "Audit Logs",
      description:
        "View and export audit logs for SSO and directory sync activities",
    },
    {
      value: WorkOSPortalIntent.LogStreams,
      label: "Log Streams",
      description: "Configure and manage log streaming for security monitoring",
    },
  ],
};

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

  return owner.workOSOrganizationId ? (
    <Button
      variant="primary"
      onClick={handleSync}
      disabled={isLoading}
      label={isLoading ? "Syncing..." : "Sync WorkOS Directories & Groups"}
    />
  ) : (
    <Button
      variant="primary"
      disabled
      label={
        isLoading
          ? "Syncing..."
          : "Your workspace is not linked to a WorkOS organization."
      }
    />
  );
}

interface WorkOSConnectionProps {
  owner: WorkspaceType;
}

export function WorkOSConnection({ owner }: WorkOSConnectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState<WorkOSPortalIntent>(
    WorkOSPortalIntent.DomainVerification
  );
  const [shouldOpenPortal, setShouldOpenPortal] = useState(false);
  const [workOSOrganizationId, setWorkOSOrganizationId] = useState<
    string | null
  >(owner.workOSOrganizationId ?? null);

  const sendNotification = useSendNotification();

  const { createOrganization } = useCreateWorkOSOrganization(owner.sId);
  const { adminPortalUrl } = useWorkOSAdminPortalUrl(owner.sId, selectedIntent);

  useEffect(() => {
    if (adminPortalUrl && shouldOpenPortal) {
      window.open(adminPortalUrl, "_blank");
      setShouldOpenPortal(false);
    }
  }, [adminPortalUrl, shouldOpenPortal]);

  const handleSetupConnection = async () => {
    const r = await createOrganization();

    if (!r || !r.ok) {
      logger.error(
        {
          workspaceId: owner.sId,
        },
        "Failed to setup WorkOS organization ID for workspace"
      );
      sendNotification({
        type: "error",
        title: "Failed to create WorkOS organization",
        description:
          "There was an error creating your WorkOS organization. Please try again.",
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "WorkOS organization created",
      description:
        "Your WorkOS organization has been created. You can now configure your enterprise settings.",
    });
    setIsModalOpen(false);
    setWorkOSOrganizationId(r.organizationId);
  };

  return (
    <Page.Vertical gap="sm">
      <Page.H variant="h5">Enterprise Connection</Page.H>
      <Page.P variant="secondary">
        {workOSOrganizationId
          ? "Manage your enterprise Identity Provider (IdP) settings and user provisioning."
          : "Create a connection to your enterprise Identity Provider (IdP). This allows you to provision users and groups from your IdP to Dust."}
      </Page.P>
      <div className="flex flex-col items-start gap-3">
        {workOSOrganizationId ? (
          <div className="flex flex-row gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  label="Select Panel"
                  size="sm"
                  isSelect
                  icon={ExternalLinkIcon}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {Object.entries(ADMIN_PANEL_OPTIONS).map(
                  ([category, options]) => (
                    <DropdownMenuGroup key={category}>
                      <DropdownMenuLabel className="capitalize">
                        {category}
                      </DropdownMenuLabel>
                      {options.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => {
                            setSelectedIntent(option.value);
                            setShouldOpenPortal(true);
                          }}
                          label={option.label}
                          description={option.description}
                        />
                      ))}
                    </DropdownMenuGroup>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button
            label="Setup Enterprise Connection"
            size="sm"
            variant="primary"
            onClick={() => setIsModalOpen(true)}
          />
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Setup Enterprise Connection</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <Page.P variant="secondary">
                This will create a WorkOS organization for your workspace.
                You'll be able to configure your enterprise settings in the
                WorkOS admin portal.
              </Page.P>
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setIsModalOpen(false),
            }}
            rightButtonProps={{
              label: "Create Connection",
              variant: "primary",
              onClick: handleSetupConnection,
            }}
          />
        </DialogContent>
      </Dialog>
      {/* Debug button: will be replaced by an actual admin console */}
      <Page.P variant="secondary">Synchronize your directories.</Page.P>
      <div className="flex w-full flex-col items-start gap-3">
        <WorkOSSyncButton owner={owner} />
      </div>
    </Page.Vertical>
  );
}
