import { ConfirmContext } from "@app/components/Confirm";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { AuditLogsSection } from "@app/components/workspace/AuditLogsSection";
import UserProvisioning from "@app/components/workspace/DirectorySync";
import { AutoJoinToggle } from "@app/components/workspace/sso/AutoJoinToggle";
import SSOConnection from "@app/components/workspace/SSOConnection";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { isSCIMEnabled } from "@app/lib/plans/scim";
import {
  useRemoveWorkspaceDomain,
  useWorkspaceDomains,
} from "@app/lib/swr/workos";
import type { PlanType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import type { WorkspaceDomain } from "@app/types/workspace";
import {
  Button,
  Chip,
  DataTable,
  EmptyCTA,
  LoadingBlock,
  Page,
  Plus,
  Separator,
  XClose,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext } from "@tanstack/react-table";
import type { Organization } from "@workos-inc/node";
import React from "react";

interface WorkspaceAccessPanelProps {
  workspaceVerifiedDomains: WorkspaceDomain[];
  owner: LightWorkspaceType;
  plan: PlanType;
  showAutoJoin?: boolean;
  showProvisioning?: boolean;
  showAuditLogs?: boolean;
}

export default function WorkspaceAccessPanel({
  workspaceVerifiedDomains,
  owner,
  plan,
  showAutoJoin = true,
  showProvisioning = true,
  showAuditLogs: showAuditLogsProp = true,
}: WorkspaceAccessPanelProps) {
  const { addDomainLink, domains, isDomainsLoading } = useWorkspaceDomains({
    owner,
  });
  const { hasFeature } = useFeatureFlags();
  const workspace = useWorkspace();
  const scimEnabled = isSCIMEnabled(plan);
  const hasAuditLogsAccess =
    plan.isAuditLogsAllowed || hasFeature("audit_logs");
  const showAuditLogs =
    showAuditLogsProp &&
    hasAuditLogsAccess &&
    workspace.metadata?.disableAuditLogs !== true;
  const showProvisioningSection = showProvisioning && scimEnabled;

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
      {showAutoJoin && (
        <AutoJoinToggle
          domains={domains}
          workspaceVerifiedDomains={workspaceVerifiedDomains}
          owner={owner}
          plan={plan}
        />
      )}
      {showProvisioningSection && <Separator />}
      {showProvisioningSection && (
        <UserProvisioning owner={owner} plan={plan} />
      )}
      {showAuditLogs && <Separator />}
      {showAuditLogs && <AuditLogsSection owner={owner} />}
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
  const { t } = useLingui();
  return (
    <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.identity.domain}>
      <span className="heading-base text-foreground">
        <Trans>Domain Verification</Trans>
      </span>
      <Page.P variant="secondary">
        <Trans>
          Verify your company domains to enable Single Sign-On (SSO), automatic
          workspace enrollment for team members, and secure connections to your
          internal MCP servers.
        </Trans>
      </Page.P>
      {isDomainsLoading ? (
        <LoadingBlock className="h-32 w-full rounded-xl" />
      ) : domains.length === 0 ? (
        <EmptyCTA
          action={
            <Button
              label={t`Add Domain`}
              variant="primary"
              icon={Plus}
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
    </AdminSectionAnchor>
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
  const { t } = useLingui();
  const confirm = React.useContext(ConfirmContext);
  const { doRemoveWorkspaceDomain } = useRemoveWorkspaceDomain({ owner });

  const handleDeleteDomain = React.useCallback(
    async (domain: string) => {
      const confirmed = await confirm({
        title: t`Delete Domain`,
        message: (
          <div>
            <Trans>
              Are you sure you want to delete the domain "{domain}"?
            </Trans>
            <div className="mt-2">
              <b>
                <Trans>This action cannot be undone.</Trans>
              </b>
            </div>
          </div>
        ),
        validateLabel: t`Delete`,
        validateVariant: "warning",
        cancelLabel: t`Cancel`,
      });

      if (confirmed) {
        await doRemoveWorkspaceDomain(domain);
      }
    },
    [confirm, doRemoveWorkspaceDomain, t]
  );

  const columns = React.useMemo(
    () => [
      {
        header: t`Domain`,
        accessorKey: "domain",
        classname: "text-xs font-medium",
        cell: ({ row }: CellContext<DomainRowData, string>) => {
          return `@${row.original.domain}`;
        },
      },
      {
        header: t`Status`,
        accessorKey: "status",
        cell: ({ getValue, row }: CellContext<DomainRowData, string>) => {
          const status = getValue();
          const workspaceVerifiedDomain = row.original.workspaceVerifiedDomain;
          let chipColor: "success" | "info" | "warning" = "info";
          let label: string = t`Pending`;
          if (workspaceVerifiedDomain && status === "verified") {
            chipColor = "success";
            label = t`Verified`;
          } else if (status === "failed") {
            chipColor = "warning";
            label = t`Failed`;
          }

          return <Chip color={chipColor} label={label} size="xs" />;
        },
      },
      {
        header: "",
        accessorKey: "actions",
        meta: { className: "w-12" },
        cell: ({ row }: CellContext<DomainRowData, string>) => {
          return (
            <Button
              icon={XClose}
              size="xs"
              variant="warning-ghost"
              onClick={() => handleDeleteDomain(row.original.domain)}
              tooltip={t`Delete domain`}
            />
          );
        },
      },
    ],
    [handleDeleteDomain, t]
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
      <DataTable columns={columns} data={data} />
      {addDomainLink && (
        <div>
          <Button
            label={t`Add Domain`}
            variant="primary"
            href={addDomainLink}
            icon={Plus}
          />
        </div>
      )}
    </div>
  );
}
