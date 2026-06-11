import { useRequestUpgrade } from "@app/lib/swr/upgrade_requests";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
} from "@dust-tt/sparkle";
import { useState } from "react";

type RequestUpgradeButtonVariant = "link" | "button";

interface RequestUpgradeButtonProps {
  owner: LightWorkspaceType;
  hasPendingUpgradeRequest: boolean;
  variant?: RequestUpgradeButtonVariant;
}

// Member-initiated upgrade-request CTA. Opens a confirmation dialog and posts
// the request via `useRequestUpgrade`. Rendered either as an inline link (usage
// banner) or as a primary button (personal settings) through `variant`.
export function RequestUpgradeButton({
  owner,
  hasPendingUpgradeRequest,
  variant = "link",
}: RequestUpgradeButtonProps) {
  const { doRequestUpgrade } = useRequestUpgrade({ workspaceId: owner.sId });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);

  const alreadyRequested = hasPendingUpgradeRequest || requested;

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      const ok = await doRequestUpgrade();
      if (ok) {
        setRequested(true);
        setIsDialogOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderTrigger() {
    if (variant === "button") {
      return (
        <Button
          variant="primary"
          size="xs"
          label={alreadyRequested ? "Requested" : "Request for upgrade"}
          disabled={alreadyRequested}
          onClick={() => setIsDialogOpen(true)}
        />
      );
    }

    if (alreadyRequested) {
      return (
        <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
          Request sent
        </span>
      );
    }

    return (
      <Hoverable
        variant="primary"
        className="copy-sm underline underline-offset-2"
        onClick={() => setIsDialogOpen(true)}
      >
        Request an upgrade
      </Hoverable>
    );
  }

  return (
    <>
      {renderTrigger()}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => !open && setIsDialogOpen(false)}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Request a usage limit upgrade</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Your workspace admins will be notified that you'd like your usage
              limit increased. They'll review your request and get back to you.
            </p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setIsDialogOpen(false),
            }}
            rightButtonProps={{
              label: "Send request",
              variant: "primary",
              isLoading: isSubmitting,
              disabled: isSubmitting,
              onClick: () => void handleConfirm(),
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
