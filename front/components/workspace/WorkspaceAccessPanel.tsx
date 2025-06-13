import {
  Button,
  Chip,
  DataTable,
  IconButton,
  Page,
  PlusIcon,
  Separator,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { Organization } from "@workos-inc/node";
import React from "react";

import { ConfirmContext } from "@app/components/Confirm";
import UserProvisioning from "@app/components/workspace/DirectorySync";
import type { EnterpriseConnectionStrategyDetails } from "@app/components/workspace/SSOConnection";
import SSOConnection from "@app/components/workspace/SSOConnection";
import {
  useRemoveWorkspaceDomain,
  useWorkspaceDomains,
} from "@app/lib/swr/workos";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType, PlanType } from "@app/types";

interface WorkspaceAccessPanelProps {
  enterpriseConnectionStrategyDetails: EnterpriseConnectionStrategyDetails;
  owner: LightWorkspaceType;
  plan: PlanType;
}

export default function WorkspaceAccessPanel({
  enterpriseConnectionStrategyDetails,
  owner,
  plan,
}: WorkspaceAccessPanelProps) {
  const { addDomainLink, domains, isDomainsLoading } = useWorkspaceDomains({
    owner,
  });

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  // Both workos and workos_user_provisioning are required to enable user provisioning.
  const hasWorkOSUserProvisioningFeature =
    hasFeature("workos") && hasFeature("workos_user_provisioning");

  return (
    <div className="flex flex-col gap-6">
      <DomainVerification
        addDomainLink={addDomainLink}
        domains={domains}
        isDomainsLoading={isDomainsLoading}
        owner={owner}
      />
      <Separator />
      <SSOConnection
        domains={domains}
        owner={owner}
        plan={plan}
        strategyDetails={enterpriseConnectionStrategyDetails}
      />
      {hasWorkOSUserProvisioningFeature && <Separator />}
      {hasWorkOSUserProvisioningFeature && (
        <UserProvisioning owner={owner} plan={plan} />
      )}
    </div>
  );
}

interface DomainVerificationProps {
  addDomainLink?: string;
  domains: Organization["domains"];
  isDomainsLoading: boolean;
  owner: LightWorkspaceType;
}

function DomainVerification({
  addDomainLink,
  domains,
  isDomainsLoading,
  owner,
}: DomainVerificationProps) {
  return (
    <div className="flex w-full flex-col gap-2">
      <Page.H variant="h4">Domain Verification</Page.H>
      <Page.P variant="secondary">
        Verify one or multiple company domains to enable Single Sign-On (SSO)
        and allow team members to automatically join your workspace when they
        sign up with their work email address.
      </Page.P>
      {isDomainsLoading ? (
        <div className="flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <DomainVerificationTable
          addDomainLink={addDomainLink}
          domains={domains}
          owner={owner}
        />
      )}
    </div>
  );
}

interface DomainVerificationTableProps {
  addDomainLink?: string;
  domains: Organization["domains"];
  owner: LightWorkspaceType;
}

// Define the row data type that extends TBaseData
interface DomainRowData {
  domain: string;
  status: string;
  onClick?: () => void;
  moreMenuItems?: any[];
}

function DomainVerificationTable({
  addDomainLink,
  domains,
  owner,
}: DomainVerificationTableProps) {
  const confirm = React.useContext(ConfirmContext);

  const { doRemoveWorkspaceDomain } = useRemoveWorkspaceDomain({ owner });

  const handleDeleteDomain = React.useCallback(
    async (domain: string) => {
      const confirmed = await confirm({
        title: "Delete Domain",
        message: (
          <div>
            Are you sure you want to delete the domain "{domain}"?
            <div className="mt-2">
              <b>This action cannot be undone.</b>
            </div>
          </div>
        ),
        validateLabel: "Delete",
        validateVariant: "warning",
      });

      if (confirmed) {
        await doRemoveWorkspaceDomain(domain);
      }
    },
    [confirm, doRemoveWorkspaceDomain]
  );

  const columns = React.useMemo(
    () => [
      {
        header: "Domain",
        accessorKey: "domain",
        classname: "text-xs font-medium",
        cell: ({ row }: { row: { original: DomainRowData } }) => {
          return `@${row.original.domain}`;
        },
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }: { getValue: () => string }) => {
          const status = getValue();
          let chipColor: "success" | "info" | "rose" = "info";

          if (status === "verified" || status === "legacy_verified") {
            chipColor = "success";
          } else if (status === "failed") {
            chipColor = "rose";
          } else if (status === "pending") {
            chipColor = "info";
          }

          return <Chip color={chipColor} label={status} size="xs" />;
        },
      },
      {
        header: "",
        accessorKey: "actions",
        meta: { className: "w-14" },
        cell: ({ row }: { row: { original: DomainRowData } }) => {
          return (
            <IconButton
              icon={XMarkIcon}
              size="xs"
              variant="tertiary"
              onClick={() => handleDeleteDomain(row.original.domain)}
              tooltip="Delete domain"
            />
          );
        },
      },
    ],
    [handleDeleteDomain]
  );

  const data: DomainRowData[] = React.useMemo(() => {
    return domains.map((domain) => ({
      domain: domain.domain,
      status: domain.state,
    }));
  }, [domains]);

  return (
    <div className="flex w-auto flex-col gap-6">
      <DataTable className="pt-6" columns={columns} data={data} />
      {addDomainLink && (
        <Button
          label="Add Domain"
          variant="primary"
          href={addDomainLink}
          target="_blank"
          icon={PlusIcon}
        />
      )}
    </div>
  );
}
