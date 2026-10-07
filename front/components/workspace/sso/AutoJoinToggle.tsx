import { MultiDomainAutoJoinModal } from "@app/components/workspace/sso/MultiDomainAutoJoinModal";
import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import type { PlanType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import type { WorkspaceDomain } from "@app/types/workspace";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Organization } from "@workos-inc/node";
import { useState } from "react";

interface DomainAutoJoinModalProps {
  workspaceVerifiedDomains: WorkspaceDomain[];
  domainAutoJoinEnabled: boolean;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}

function DomainAutoJoinModal({
  workspaceVerifiedDomains,
  domainAutoJoinEnabled,
  isOpen,
  onClose,
  owner,
}: DomainAutoJoinModalProps) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const title = domainAutoJoinEnabled
    ? t`De-activate Auto-join`
    : t`Activate Auto-join`;
  const validateLabel = domainAutoJoinEnabled ? t`De-activate` : t`Activate`;
  const validateVariant = domainAutoJoinEnabled ? "warning" : "primary";
  const domainList = workspaceVerifiedDomains
    .map((d) => `"@${d.domain}"`)
    .join(", ");
  const description = domainAutoJoinEnabled ? (
    t`New members will need to be invited in order to gain access to your Dust Workspace.`
  ) : (
    <span>
      <Trans>
        Anyone with a <span className="font-bold">{domainList}</span> email will
        have access to your Dust Workspace.
      </Trans>
    </span>
  );

  async function handleUpdateWorkspace(): Promise<void> {
    const res = await clientFetch(`/api/w/${owner.sId}/domains`, {
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
        title: t`Update failed`,
        description: t`Failed to enable auto-add for whitelisted domain.`,
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
            label: t`Cancel`,
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
  const { t } = useLingui();
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
  const domainCount = domains.length;
  const domainList = domains.map((d) => `"@${d.domain}"`).join(", ");

  return (
    <>
      {isMultiDomain ? (
        <MultiDomainAutoJoinModal
          workspaceVerifiedDomains={workspaceVerifiedDomains}
          isOpen={isActivateAutoJoinOpened}
          onClose={() => {
            setIsActivateAutoJoinOpened(false);
          }}
          owner={owner}
        />
      ) : (
        <DomainAutoJoinModal
          domainAutoJoinEnabled={domainAutoJoinEnabled}
          isOpen={isActivateAutoJoinOpened}
          onClose={() => {
            setIsActivateAutoJoinOpened(false);
          }}
          workspaceVerifiedDomains={workspaceVerifiedDomains}
          owner={owner}
        />
      )}
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title={t`Free plan`}
        description={t`You cannot enable auto-join with the free plan. Upgrade your plan to invite other members.`}
      />
      <Page.Vertical>
        <div className="flex w-full flex-row items-center gap-2">
          <div className="flex-1">
            <div className="flex flex-row items-center gap-2">
              <Page.H variant="h5">
                <Trans>Auto-join Workspace</Trans>
              </Page.H>
            </div>
            <Page.P variant="secondary">
              {domainCount > 0
                ? t`${plural(domainCount, {
                    one: `Allow your team members to access your Dust workspace when they authenticate with ${domainList} account.`,
                    other: `Allow your team members to access your Dust workspace when they authenticate with ${domainList} accounts.`,
                  })}`
                : t`Allow your team members to access your Dust workspace when they authenticate with verified accounts.`}
            </Page.P>
          </div>
          <div className="flex justify-end">
            {isMultiDomain ? (
              <Button
                label={
                  isAnyDomainAutoJoinEnabled
                    ? t`Configure`
                    : t`Enable Auto-join`
                }
                size="sm"
                variant={isAnyDomainAutoJoinEnabled ? "outline" : "primary"}
                tooltip={
                  owner.ssoEnforced
                    ? t`Auto-join is not available when SSO is enforced`
                    : domains.length === 0
                      ? t`Add a domain to enable Auto-join`
                      : !hasVerifiedDomains
                        ? t`Verify a domain to enable Auto-join`
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
                label={t`De-activate Auto-join`}
                size="sm"
                variant="outline"
                disabled={owner.ssoEnforced}
                tooltip={
                  owner.ssoEnforced
                    ? t`Auto-join is not available when SSO is enforced`
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
                label={t`Activate Auto-join`}
                size="sm"
                variant="primary"
                tooltip={
                  owner.ssoEnforced
                    ? t`Auto-join is not available when SSO is enforced`
                    : domains.length === 0
                      ? t`Add a domain to enable Auto-join`
                      : !hasVerifiedDomains
                        ? t`Verify a domain to enable Auto-join`
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
