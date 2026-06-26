import { UsageUpgradeButton } from "@app/components/credits/UsageUpgradeButton";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";

interface InputBarUsageBannerProps {
  owner: LightWorkspaceType;
}

export function InputBarUsageBanner({ owner }: InputBarUsageBannerProps) {
  const { isAdmin } = useAuth();
  const {
    userNearCreditLimit,
    canRequestUpgrade,
    hasPendingUpgradeRequest,
    userBlockedReason,
    willAutoUpgrade,
  } = useWorkspaceUsageStatus({
    owner,
  });

  const showUpgradeCta = !willAutoUpgrade && (canRequestUpgrade || isAdmin);

  if (userBlockedReason === "no_seat") {
    return (
      <div
        className={cn(
          "mb-2 flex w-full items-center gap-2 rounded-2xl border px-4 py-3",
          "border-warning-200 bg-warning-100",
          "dark:border-warning-200-night dark:bg-warning-100-night"
        )}
      >
        <span className="copy-sm grow truncate text-warning-900 dark:text-warning-900-night">
          You don&apos;t have a seat in this workspace.
        </span>
        {showUpgradeCta && (
          <div className="shrink-0">
            <UsageUpgradeButton
              owner={owner}
              hasPendingUpgradeRequest={hasPendingUpgradeRequest}
              isAdmin={isAdmin}
            />
          </div>
        )}
      </div>
    );
  }

  if (!userNearCreditLimit && userBlockedReason !== "user_cap_reached") {
    return null;
  }

  const isBlocked = userBlockedReason === "user_cap_reached";

  let message: string;
  if (isBlocked) {
    message = "You've reached your usage limit";
  } else {
    message = "You've used 80% of your usage limit";
    if (willAutoUpgrade) {
      message += ". You'll be automatically upgraded when you reach the limit";
    }
  }

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
          isBlocked && !willAutoUpgrade
            ? "text-warning-500 dark:text-warning-500-night"
            : "text-foreground dark:text-foreground-night"
        )}
      >
        {message}
      </span>
      {showUpgradeCta && (
        <div className="shrink-0">
          <UsageUpgradeButton
            owner={owner}
            hasPendingUpgradeRequest={hasPendingUpgradeRequest}
            isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}
