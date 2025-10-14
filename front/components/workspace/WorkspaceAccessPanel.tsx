import {
  ActionGlobeAltIcon,
  Button,
  Chip,
  DataTable,
  EmptyCTA,
  IconButton,
  LoadingBlock,
  Page,
  PlusIcon,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import type { Organization } from "@workos-inc/node";
import React from "react";

import { ConfirmContext } from "@app/components/Confirm";
import UserProvisioning from "@app/components/workspace/DirectorySync";
import { AutoJoinToggle } from "@app/components/workspace/sso/AutoJoinToggle";
import SSOConnection from "@app/components/workspace/SSOConnection";
import {
  useRemoveWorkspaceDomain,
  useWorkspaceDomains,
} from "@app/lib/swr/workos";
import type { LightWorkspaceType, PlanType, WorkspaceDomain } from "@app/types";

import { WorkspaceSection } from "./WorkspaceSection";

interface WorkspaceAccessPanelProps {
  workspaceVerifiedDomains: WorkspaceDomain[];
  owner: LightWorkspaceType;
  plan: PlanType;
}

export default function WorkspaceAccessPanel({
  workspaceVerifiedDomains,
  owner,
  plan,
}: WorkspaceAccessPanelProps) {
  const { addDomainLink, domains, isDomainsLoading } = useWorkspaceDomains({
    owner,
  });

  return (
    <div className="flex flex-col gap-6">
      <DomainVerification
        addDomainLink={addDomainLink}
        domains={domains}
        workspaceVerifiedDomains={workspaceVerifiedDomains}
        isDomainsLoading={isDomainsLoading}
        owner={owner}
      />
      <Separator />
      <SSOConnection domains={domains} plan={plan} owner={owner} />
      <AutoJoinToggle
        domains={domains}
        workspaceVerifiedDomains={workspaceVerifiedDomains}
        owner={owner}
        plan={plan}
      />
      {plan.limits.users.isSCIMAllowed && <Separator />}
      {plan.limits.users.isSCIMAllowed && (
        <UserProvisioning owner={owner} plan={plan} />
      )}
    </div>
  );
}

interface DomainVerificationProps {
  addDomainLink?: string;
  domains: Organization["domains"];
  workspaceVerifiedDomains: WorkspaceDomain[];
  isDomainsLoading: boolean;
  owner: LightWorkspaceType;
}

function DomainVerification({
  addDomainLink,
  domains,
  workspaceVerifiedDomains,
  isDomainsLoading,
  owner,
}: DomainVerificationProps) {
  return (
    <WorkspaceSection icon={ActionGlobeAltIcon} title="Domain Verification">
      <Page.P variant="secondary">
        Verify one or multiple company domains to enable Single Sign-On (SSO)
        and allow team members to automatically join your workspace when they
        sign up with their work email address.
      </Page.P>
      {isDomainsLoading ? (
        <LoadingBlock className="h-32 w-full rounded-xl" />
      ) : domains.length === 0 ? (
        <EmptyCTA
          action={
            <Button
              label="Add Domain"
              variant="primary"
              icon={PlusIcon}
              href={addDomainLink}
            />
          }
        />
      ) : (
        <DomainVerificationTable
          addDomainLink={addDomainLink}
          domains={domains}
          workspaceVerifiedDomains={workspaceVerifiedDomains}
          owner={owner}
        />
      )}
    </WorkspaceSection>
  );
}

interface DomainVerificationTableProps {
  addDomainLink?: string;
  domains: Organization["domains"];
  workspaceVerifiedDomains: WorkspaceDomain[];
  owner: LightWorkspaceType;
}

// Define the row data type that extends TBaseData
interface DomainRowData {
  domain: string;
  workspaceVerifiedDomain?: WorkspaceDomain;
  status: string;
  onClick?: () => void;
}

function DomainVerificationTable({
  addDomainLink,
  domains,
  workspaceVerifiedDomains,
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
        cell: ({ row }: CellContext<DomainRowData, string>) => {
          return `@${row.original.domain}`;
        },
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue, row }: CellContext<DomainRowData, string>) => {
          const status = getValue();
          const workspaceVerifiedDomain = row.original.workspaceVerifiedDomain;
          let chipColor: "success" | "info" | "rose" = "info";
          let label: string = "Pending";
          if (workspaceVerifiedDomain && status === "verified") {
            chipColor = "success";
            label = "Verified";
          } else if (status === "failed") {
            chipColor = "rose";
            label = "Failed";
          }

          return <Chip color={chipColor} label={label} size="xs" />;
        },
      },
      {
        header: "",
        accessorKey: "actions",
        meta: { className: "w-14" },
        cell: ({ row }: CellContext<DomainRowData, string>) => {
          return (
            <IconButton
              icon={XMarkIcon}
              size="xs"
              variant="ghost"
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
      workspaceVerifiedDomain: workspaceVerifiedDomains.find(
        (d) => d.domain === domain.domain
      ),
    }));
  }, [domains, workspaceVerifiedDomains]);

  return (
    <div className="flex w-auto flex-col gap-6">
      <DataTable className="pt-6" columns={columns} data={data} />
      {addDomainLink && (
        <div>
          <Button
            label="Add Domain"
            variant="primary"
            href={addDomainLink}
            target="_blank"
            icon={PlusIcon}
          />
        </div>
      )}
    </div>
  );
}
