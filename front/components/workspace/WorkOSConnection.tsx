import { Button, Dialog, DialogContainer, DialogContent, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger, Page, ExternalLinkIcon } from "@dust-tt/sparkle";
import { useCallback, useState, useEffect } from "react";
import { WorkOSPortalIntent } from "@app/lib/types/workos";

import { useCreateWorkOSOrganization, useWorkOSAdminPortalUrl } from "@app/lib/swr/workos";
import { useWorkspaceEnterpriseConnection } from "@app/lib/swr/workspaces";
import { use } from "dd-trace";

interface WorkOSConnectionProps {
  owner: {
    sId: string;
    workOSOrganizationId?: string | null;
  };
}

const ADMIN_PANEL_OPTIONS = {
  domain: [
    { 
      value: WorkOSPortalIntent.DomainVerification, 
      label: "Domain Verification",
      description: "Verify your organization's domain for SSO and email domain matching"
    },
  ],
  config: [
    { 
      value: WorkOSPortalIntent.SSO, 
      label: "SSO Settings",
      description: "Configure Single Sign-On (SSO) with your identity provider"
    },
    { 
      value: WorkOSPortalIntent.DSync, 
      label: "Directory Sync",
      description: "Set up and manage directory synchronization with your identity provider"
    },
  ],
  logs: [
    { 
      value: WorkOSPortalIntent.AuditLogs, 
      label: "Audit Logs",
      description: "View and export audit logs for SSO and directory sync activities"
    },
    { 
      value: WorkOSPortalIntent.LogStreams, 
      label: "Log Streams",
      description: "Configure and manage log streaming for security monitoring"
    },
  ],
};

export function WorkOSConnection({ owner }: WorkOSConnectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState<WorkOSPortalIntent>(WorkOSPortalIntent.DomainVerification);
  const [shouldOpenPortal, setShouldOpenPortal] = useState(false);

  const { createOrganization } = useCreateWorkOSOrganization(
    owner.sId
  );

  const { adminPortalUrl } = useWorkOSAdminPortalUrl(
    owner.sId,
    selectedIntent
  );

  useEffect(() => {
    if (adminPortalUrl && shouldOpenPortal) {
      window.open(adminPortalUrl, "_blank");
      setShouldOpenPortal(false);
    }
  }, [adminPortalUrl, shouldOpenPortal]);

  const handleSetupConnection = async () => {
    try {
      const { organizationId } = await createOrganization();

      // Update the workspace with the WorkOS organization ID
      await fetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workOSOrganizationId: organizationId,
        }),
      });

      location.reload();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to create WorkOS organization:", error);
      alert("Failed to create enterprise connection. Please try again.");
    }
  };

  const getSelectedLabel = () => {
    const allOptions = [...ADMIN_PANEL_OPTIONS.domain, ...ADMIN_PANEL_OPTIONS.config, ...ADMIN_PANEL_OPTIONS.logs];
    return allOptions.find(opt => opt.value === selectedIntent)?.label || "Select Panel";
  };

  return (
    <Page.Vertical gap="sm">
      <Page.H variant="h5">Enterprise Connection</Page.H>
      <Page.P variant="secondary">
        {owner.workOSOrganizationId
          ? "Manage your enterprise Identity Provider (IdP) settings and user provisioning."
          : "Create a connection to your enterprise Identity Provider (IdP). This allows you to provision users and groups from your IdP to Dust."}
      </Page.P>
      <div className="flex flex-col items-start gap-3">
        {owner.workOSOrganizationId ? (
          <div className="flex flex-row gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  label={getSelectedLabel()}
                  size="sm"
                  isSelect
                  icon={ExternalLinkIcon}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {Object.entries(ADMIN_PANEL_OPTIONS).map(([category, options]) => (
                  <DropdownMenuGroup key={category}>
                    <DropdownMenuLabel>{category.charAt(0).toUpperCase() + category.slice(1)}</DropdownMenuLabel>
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
                ))}
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
                You'll be able to configure your enterprise settings in the WorkOS admin portal.
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
    </Page.Vertical>
  );
}