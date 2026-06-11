import { useRequestUpgrade } from "@app/lib/swr/upgrade_requests";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types/user";
import {
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface RequestUpgradeButtonProps {
  owner: LightWorkspaceType;
  hasPendingUpgradeRequest: boolean;
}
function RequestUpgradeButton({
  owner,
  hasPendingUpgradeRequest,
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

  if (alreadyRequested) {
    return (
      <span className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
        Request sent
      </span>
    );
  }

  return (
    <>
      <Hoverable
        variant="primary"
        className="copy-sm underline underline-offset-2"
        onClick={() => setIsDialogOpen(true)}
      >
        Request an upgrade
      </Hoverable>
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

interface InputBarUsageBannerProps {
  owner: LightWorkspaceType;
}

export function InputBarUsageBanner({ owner }: InputBarUsageBannerProps) {
  const { awuStatus, noSeat, canRequestUpgrade, hasPendingUpgradeRequest } =
    useWorkspaceUsageStatus({
      owner,
    });

  const showAwuBanner = awuStatus !== "normal";

  // A seatless member cannot run agents at all, so this takes precedence over
  // the usage-limit banner.
  if (!noSeat && !showAwuBanner) {
    return null;
  }

  // noSeat is a hard block, treated like the "blocked" AWU state. The upgrade
  // CTA only addresses the usage limit, so it is not offered when seatless.
  const isBlocked = noSeat || awuStatus === "blocked";
  const message = noSeat
    ? "You don't have a seat in this workspace. Contact your admin to be assigned a seat."
    : awuStatus === "blocked"
      ? "You've reached your usage limit"
      : "You've used 80% of your usage limit";
  const showUpgradeCta = !noSeat && canRequestUpgrade;

  return (
    <div
      className={cn(
        "mb-2 flex w-full items-center gap-2 rounded-2xl border px-4 py-3",
        "border-border-dark/50 bg-background",
        "dark:border-border-dark-night/30 dark:bg-background-night"
      )}
    >
      <span
        className={cn(
          "copy-sm grow truncate",
          isBlocked
            ? "text-warning-500 dark:text-warning-500-night"
            : "text-foreground dark:text-foreground-night"
        )}
      >
        {message}
      </span>
      {showUpgradeCta && (
        <div className="shrink-0">
          <RequestUpgradeButton
            owner={owner}
            hasPendingUpgradeRequest={hasPendingUpgradeRequest}
          />
        </div>
      )}
    </div>
  );
}
