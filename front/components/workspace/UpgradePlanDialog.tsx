import { useAppRouter } from "@app/lib/platform";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface UpgradePlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  title?: string;
  description?: string;
}

export function UpgradePlanDialog({
  isOpen,
  onClose,
  workspaceId,
  title,
  description,
}: UpgradePlanDialogProps) {
  const { t } = useLingui();
  const router = useAppRouter();
  const { hasPermission } = useWorkspacePermissions();

  const canManageBilling = hasPermission("admin", "billing");

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title ?? t`Free plan`}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {description ??
            t`You cannot enable auto-join with the free plan. Upgrade your plan to invite other members.`}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: t`Check Dust plans`,
            variant: "primary",
            disabled: !canManageBilling,
            tooltip: canManageBilling
              ? undefined
              : t`You do not have permission to upgrade the plan.`,
            onClick: () => {
              void router.push(`/w/${workspaceId}/subscription`);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
