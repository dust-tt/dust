import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  ExternalLinkIcon,
  Page,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useWorkOSAdminPortalUrl } from "@app/lib/swr/workos";
import { WorkOSPortalIntent } from "@app/lib/types/workos";

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

interface WorkOSConnectionProps {
  owner: {
    sId: string;
    workOSOrganizationId?: string | null;
  };
}

export function WorkOSConnection({ owner }: WorkOSConnectionProps) {
  const [selectedIntent, setSelectedIntent] = useState<WorkOSPortalIntent>(
    WorkOSPortalIntent.DomainVerification
  );
  const [shouldOpenPortal, setShouldOpenPortal] = useState(false);

  const { adminPortalUrl } = useWorkOSAdminPortalUrl(owner.sId, selectedIntent);

  useEffect(() => {
    if (adminPortalUrl && shouldOpenPortal) {
      window.open(adminPortalUrl, "_blank");
      setShouldOpenPortal(false);
    }
  }, [adminPortalUrl, shouldOpenPortal]);


  const getSelectedLabel = () => {
    const allOptions = [
      ...ADMIN_PANEL_OPTIONS.domain,
      ...ADMIN_PANEL_OPTIONS.config,
      ...ADMIN_PANEL_OPTIONS.logs,
    ];
    return (
      allOptions.find((opt) => opt.value === selectedIntent)?.label ||
      "Select Panel"
    );
  };

  return (
    <Page.Vertical gap="sm">
      <Page.H variant="h5">Enterprise Connection</Page.H>
      <Page.P variant="secondary">
        {owner.workOSOrganizationId
          ? "Manage your enterprise Identity Provider (IdP) settings and user provisioning."
          : "Your WorkOS organization will be automatically created when your workspace plan becomes Enterprise."}
      </Page.P>
      {owner.workOSOrganizationId && (
        <div className="flex flex-col items-start gap-3">
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
        </div>
      )}
    </Page.Vertical>
  );
}
