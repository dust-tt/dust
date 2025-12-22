import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";

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
  const router = useRouter();

  return (
    <Dialog open={isOpen}>
      <DialogContent>
        <DialogHeader>{title}</DialogHeader>
        {description}
        <DialogFooter>
          <Button variant="outline" label="Cancel" onClick={onClose} />
          <Button
            label="Check Dust plans"
            onClick={() => {
              void router.push(`/w/${workspaceId}/subscription`);
            }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
