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
  title = "Free plan",
  description = "You cannot enable auto-join with the free plan. Upgrade your plan to invite other members.",
}: UpgradePlanDialogProps) {
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogContainer>{description}</DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Check Dust plans",
            variant: "primary",
            disabled: !canManageBilling,
            tooltip: canManageBilling
              ? undefined
              : "You do not have permission to upgrade the plan.",
            onClick: () => {
              void router.push(`/w/${workspaceId}/subscription`);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
