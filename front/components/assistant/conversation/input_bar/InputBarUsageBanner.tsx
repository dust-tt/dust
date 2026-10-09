import { UsageUpgradeButton } from "@app/components/credits/UsageUpgradeButton";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

interface InputBarUsageBannerProps {
  owner: LightWorkspaceType;
}

function UsageBannerShell({
  children,
  action,
  variant = "default",
}: {
  children: ReactNode;
  action?: ReactNode;
  variant?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "mb-2 flex w-full items-center gap-2 rounded-2xl border px-4 py-3",
        variant === "warning"
          ? "border-warning-200 bg-warning-100"
          : "border-border-dark/50 bg-background"
      )}
    >
      {children}
      {action}
    </div>
  );
}

export function InputBarUsageBanner({ owner }: InputBarUsageBannerProps) {
  const { t } = useLingui();
  const { isManager } = useAuth();
  const {
    userNearCreditLimit,
    canRequestUpgrade,
    hasPendingUpgradeRequest,
    userBlockedReason,
    willAutoUpgrade,
    requireReason,
  } = useWorkspaceUsageStatus({
    owner,
  });

  const showUpgradeCta = !willAutoUpgrade && (canRequestUpgrade || isManager);

  const upgradeButton = showUpgradeCta ? (
    <div className="shrink-0">
      <UsageUpgradeButton
        owner={owner}
        hasPendingUpgradeRequest={hasPendingUpgradeRequest}
        isManager={isManager}
        requireReason={requireReason}
      />
    </div>
  ) : null;

  // Pool / group blocks aren't fixed by a personal upgrade request — only
  // managers get a link through to the workspace usage page.
  const managerUsageButton = isManager ? (
    <div className="shrink-0">
      <UsageUpgradeButton
        owner={owner}
        hasPendingUpgradeRequest={hasPendingUpgradeRequest}
        isManager
      />
    </div>
  ) : null;

  switch (userBlockedReason) {
    case "no_seat":
      return (
        <UsageBannerShell variant="warning" action={upgradeButton}>
          <span className="copy-sm grow truncate text-warning-900">
            <Trans>You don&apos;t have a seat in this workspace.</Trans>
          </span>
        </UsageBannerShell>
      );

    case "user_cap_reached":
      return (
        <UsageBannerShell action={upgradeButton}>
          <span
            className={cn(
              "copy-sm grow truncate",
              !willAutoUpgrade ? "text-warning-500" : "text-foreground"
            )}
          >
            {t`You've reached your usage limit`}
          </span>
        </UsageBannerShell>
      );

    case "credits_exhausted":
      return (
        <UsageBannerShell action={managerUsageButton}>
          <span className="copy-sm grow truncate text-warning-500">
            <Trans>Your workspace has run out of credits.</Trans>
          </span>
        </UsageBannerShell>
      );

    case "group_shared_usage_limit_reached":
      return (
        <UsageBannerShell action={managerUsageButton}>
          <span className="copy-sm grow truncate text-warning-500">
            <Trans>Your group has reached its shared usage limit.</Trans>
          </span>
        </UsageBannerShell>
      );

    case null: {
      if (!userNearCreditLimit) {
        return null;
      }

      const message = willAutoUpgrade
        ? t`You've used 80% of your usage limit. You'll be automatically upgraded when you reach the limit`
        : t`You've used 80% of your usage limit`;

      return (
        <UsageBannerShell action={upgradeButton}>
          <span className="copy-sm grow truncate text-foreground">
            {message}
          </span>
        </UsageBannerShell>
      );
    }

    default:
      assertNeverAndIgnore(userBlockedReason);
      return null;
  }
}
