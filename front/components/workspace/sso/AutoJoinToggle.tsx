import {
  Button,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Page,
} from "@dust-tt/sparkle";
import type { Organization } from "@workos-inc/node";
import { useEffect, useState } from "react";

import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import type { PlanType, WorkspaceDomain, WorkspaceType } from "@app/types";
import { pluralize } from "@app/types";

type DomainAutoJoinModalProps = {
  domains: Organization["domains"];
  domainAutoJoinEnabled: boolean;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
};

function DomainAutoJoinModal({
  domains,
  domainAutoJoinEnabled,
  isOpen,
  onClose,
  owner,
}: DomainAutoJoinModalProps) {
  const sendNotification = useSendNotification();
  const title = domainAutoJoinEnabled
    ? "De-activate Auto-join"
    : "Activate Auto-join";
  const validateLabel = domainAutoJoinEnabled ? "De-activate" : "Activate";
  const validateVariant = domainAutoJoinEnabled ? "warning" : "primary";
  const description = domainAutoJoinEnabled ? (
    "New members will need to be invited in order to gain access to your Dust Workspace."
  ) : (
    <span>
      Anyone with Google{" "}
      <span className="font-bold">
        {domains.map((d) => `"@${d.domain}"`).join(", ")}
      </span>{" "}
      account will have access to your Dust Workspace.
    </span>
  );

  async function handleUpdateWorkspace(): Promise<void> {
    const res = await clientFetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domainAutoJoinEnabled: !domainAutoJoinEnabled,
      }),
    });

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Update failed",
        description: `Failed to enable auto-add for whitelisted domain.`,
      });
    } else {
      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogContainer>{description}</DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: validateLabel,
            variant: validateVariant,
            onClick: async () => {
              await handleUpdateWorkspace();
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface MultiDomainAutoJoinModalProps {
  workspaceVerifiedDomains: WorkspaceDomain[];
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}

function MultiDomainAutoJoinModal({
  workspaceVerifiedDomains,
  isOpen,
  onClose,
  owner,
}: MultiDomainAutoJoinModalProps) {
  const sendNotification = useSendNotification();
  const [domainOverrides, setDomainOverrides] = useState<
    Record<string, boolean>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDomainOverrides({});
    }
  }, [isOpen]);

  const hasChanges = workspaceVerifiedDomains.some((d) => {
    const desiredValue = domainOverrides[d.domain];
    return (
      desiredValue !== undefined && desiredValue !== d.domainAutoJoinEnabled
    );
  });

  const isDomainEnabled = (domain: WorkspaceDomain): boolean =>
    domainOverrides[domain.domain] ?? domain.domainAutoJoinEnabled;

  const handleDomainToggle = (domain: WorkspaceDomain) => {
    setDomainOverrides((prev) => {
      const currentValue = prev[domain.domain] ?? domain.domainAutoJoinEnabled;
      return {
        ...prev,
        [domain.domain]: !currentValue,
      };
    });
  };

  async function handleSave(): Promise<void> {
    const updates = workspaceVerifiedDomains
      .map((d) => ({
        domain: d.domain,
        enabled: domainOverrides[d.domain] ?? d.domainAutoJoinEnabled,
        previous: d.domainAutoJoinEnabled,
      }))
      .filter((u) => u.enabled !== u.previous)
      .map(({ domain, enabled }) => ({ domain, enabled }));

    if (updates.length === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const results = await Promise.allSettled(
        updates.map((u) =>
          clientFetch(`/api/w/${owner.sId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              domain: u.domain,
              domainAutoJoinEnabled: u.enabled,
            }),
          })
        )
      );

      const failedDomains: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "rejected" || !result.value.ok) {
          failedDomains.push(updates[index].domain);
        }
      });

      if (failedDomains.length > 0) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: `Failed to update auto-join for: ${failedDomains.map((d) => `@${d}`).join(", ")}`,
        });
      }

      // Full refresh to update owner object and keep formValidation logic working.
      window.location.reload();
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Configure Auto-join</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Select which domains should allow users to automatically join your
              workspace when they sign up with a matching email address.
            </p>
            <div className="flex flex-col gap-3">
              {workspaceVerifiedDomains.map((d) => (
                <div key={d.domain} className="flex items-center gap-2">
                  <Checkbox
                    id={`domain-${d.domain}`}
                    checked={isDomainEnabled(d)}
                    onCheckedChange={() => handleDomainToggle(d)}
                    disabled={isSubmitting}
                  />
                  <Label htmlFor={`domain-${d.domain}`} className="font-normal">
                    @{d.domain}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isSubmitting,
          }}
          rightButtonProps={{
            label: isSubmitting ? "Saving..." : "Save",
            variant: "primary",
            onClick: handleSave,
            disabled: !hasChanges || isSubmitting,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

type AutoJoinToggleProps = {
  domains: Organization["domains"];
  workspaceVerifiedDomains: WorkspaceDomain[];
  owner: WorkspaceType;
  plan: PlanType;
};

export function AutoJoinToggle({
  domains,
  workspaceVerifiedDomains,
  owner,
  plan,
}: AutoJoinToggleProps) {
  const [showUpgradePlanDialog, setShowUpgradePlanDialog] = useState(false);
  const [isActivateAutoJoinOpened, setIsActivateAutoJoinOpened] =
    useState(false);
  const domainAutoJoinEnabled =
    workspaceVerifiedDomains.length > 0 &&
    workspaceVerifiedDomains.every((d) => d.domainAutoJoinEnabled);
  const isMultiDomain = workspaceVerifiedDomains.length > 1;
  const isAnyDomainAutoJoinEnabled = workspaceVerifiedDomains.some(
    (d) => d.domainAutoJoinEnabled
  );
  const hasVerifiedDomains = workspaceVerifiedDomains.length > 0;

  return (
    <>
      <DomainAutoJoinModal
        domainAutoJoinEnabled={domainAutoJoinEnabled}
        isOpen={isActivateAutoJoinOpened && !isMultiDomain}
        onClose={() => {
          setIsActivateAutoJoinOpened(false);
        }}
        domains={domains}
        owner={owner}
      />
      {isMultiDomain && (
        <MultiDomainAutoJoinModal
          workspaceVerifiedDomains={workspaceVerifiedDomains}
          isOpen={isActivateAutoJoinOpened}
          onClose={() => {
            setIsActivateAutoJoinOpened(false);
          }}
          owner={owner}
        />
      )}
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title="Free plan"
        description="You cannot enable auto-join with the free plan. Upgrade your plan to invite other members."
      />
      <Page.Vertical>
        <div className="flex w-full flex-row items-center gap-2">
          <div className="flex-1">
            <div className="flex flex-row items-center gap-2">
              <Page.H variant="h5">Auto-join Workspace</Page.H>
            </div>
            <Page.P variant="secondary">
              Allow your team members to access your Dust workspace when they
              authenticate with
              {domains.length > 0
                ? domains.map((d) => `" @${d.domain}"`).join(", ")
                : " verified"}{" "}
              account
              {pluralize(domains.length)}.
            </Page.P>
          </div>
          <div className="flex justify-end">
            {isMultiDomain ? (
              <Button
                label={
                  isAnyDomainAutoJoinEnabled ? "Configure" : "Enable Auto-join"
                }
                size="sm"
                variant={isAnyDomainAutoJoinEnabled ? "outline" : "primary"}
                tooltip={
                  owner.ssoEnforced
                    ? "Auto-join is not available when SSO is enforced"
                    : domains.length === 0
                      ? "Add a domain to enable Auto-join"
                      : !hasVerifiedDomains
                        ? "Verify a domain to enable Auto-join"
                        : undefined
                }
                disabled={
                  !domains.length || !!owner.ssoEnforced || !hasVerifiedDomains
                }
                onClick={() => {
                  if (isUpgraded(plan)) {
                    setIsActivateAutoJoinOpened(true);
                  } else {
                    setShowUpgradePlanDialog(true);
                  }
                }}
              />
            ) : domainAutoJoinEnabled ? (
              <Button
                label="De-activate Auto-join"
                size="sm"
                variant="outline"
                disabled={owner.ssoEnforced}
                tooltip={
                  owner.ssoEnforced
                    ? "Auto-join is not available when SSO is enforced"
                    : undefined
                }
                onClick={() => {
                  if (isUpgraded(plan)) {
                    setIsActivateAutoJoinOpened(true);
                  } else {
                    setShowUpgradePlanDialog(true);
                  }
                }}
              />
            ) : (
              <Button
                label="Activate Auto-join"
                size="sm"
                variant="primary"
                tooltip={
                  owner.ssoEnforced
                    ? "Auto-join is not available when SSO is enforced"
                    : domains.length === 0
                      ? "Add a domain to enable Auto-join"
                      : !hasVerifiedDomains
                        ? "Verify a domain to enable Auto-join"
                        : undefined
                }
                disabled={
                  !domains.length || !!owner.ssoEnforced || !hasVerifiedDomains
                }
                onClick={() => {
                  if (isUpgraded(plan)) {
                    setIsActivateAutoJoinOpened(true);
                  } else {
                    setShowUpgradePlanDialog(true);
                  }
                }}
              />
            )}
          </div>
        </div>
      </Page.Vertical>
    </>
  );
}
