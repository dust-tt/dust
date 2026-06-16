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
  const { awuStatus, canRequestUpgrade, hasPendingUpgradeRequest } =
    useWorkspaceUsageStatus({
      owner,
    });

  const showAwuBanner = awuStatus !== "normal";
  const showUpgradeCta = canRequestUpgrade || isAdmin;

  if (!showAwuBanner) {
    return null;
  }

  const isBlocked = awuStatus === "blocked";

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
        {isBlocked
          ? "You've reached your usage limit"
          : "You've used 80% of your usage limit"}
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
