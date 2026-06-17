import type { AppStatus } from "@app/lib/api/status";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  FREE_BYOK_TRANSITIONING_PLAN_CODE,
  isDustCompanyPlan,
  isEnterprisePlanPrefix,
} from "@app/lib/plans/plan_codes";
import { useProgrammaticUsageLimit } from "@app/lib/swr/usage_settings";
import { useAppStatus } from "@app/lib/swr/useAppStatus";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import { useMetronomeContract } from "@app/lib/swr/workspaces";
import { DEFAULT_EMBEDDING_PROVIDER_ID } from "@app/types/assistant/models/embedding";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { SubscriptionType } from "@app/types/plan";
import { PRETTIFIED_PROVIDER_NAMES } from "@app/types/provider_selection";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { cn, LinkWrapper } from "@dust-tt/sparkle";
import { cva, type VariantProps } from "class-variance-authority";

const statusBannerVariants = cva("space-y-2 border-y px-3 py-3 text-xs", {
  variants: {
    variant: {
      info: cn(
        "border-info-200 dark:border-info-200-night",
        "bg-info-100 dark:bg-info-100-night",
        "text-info-900 dark:text-info-900-night"
      ),
      warning: cn(
        "border-warning-200 dark:border-warning-200-night",
        "bg-warning-100 dark:bg-warning-100-night",
        "text-warning-900 dark:text-warning-900-night"
      ),
      success: cn(
        "border-success-200 dark:border-success-200-night",
        "bg-success-100 dark:bg-success-100-night",
        "text-success-900 dark:text-success-900-night"
      ),
      danger: cn(
        "border-red-200 dark:border-red-200",
        "bg-red-100 dark:bg-red-100",
        "text-red-900 dark:text-red-900"
      ),
    },
  },
  defaultVariants: {
    variant: "info",
  },
});

interface StatusBannerProps extends VariantProps<typeof statusBannerVariants> {
  title: string;
  description: React.ReactNode;
  footer?: React.ReactNode;
}

function StatusBanner({
  variant,
  title,
  description,
  footer,
}: StatusBannerProps) {
  return (
    <div className={statusBannerVariants({ variant })}>
      <div className="font-bold">{title}</div>
      <div className="font-normal">{description}</div>
      {footer && <div>{footer}</div>}
    </div>
  );
}

interface AppStatusBannerProps {
  appStatus: AppStatus;
}

function AppStatusBanner({ appStatus }: AppStatusBannerProps) {
  const { providersStatus, dustStatus } = appStatus;

  if (dustStatus) {
    return (
      <StatusBanner
        title={dustStatus.name}
        description={dustStatus.description}
        footer={
          <>
            Check our{" "}
            <LinkWrapper
              href={dustStatus.link}
              target="_blank"
              className="underline"
            >
              status page
            </LinkWrapper>{" "}
            for updates.
          </>
        }
      />
    );
  }

  if (providersStatus) {
    return (
      <StatusBanner
        title={providersStatus.name}
        description={providersStatus.description}
      />
    );
  }

  return null;
}

interface UnhealthyCredentialsBannerProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}

function UnhealthyCredentialsBanner({
  owner,
  subscription,
}: UnhealthyCredentialsBannerProps) {
  const { providersHealth } = useAuth();

  if (!providersHealth) {
    return null;
  }

  const title = "Your workspace is not operational";
  const footer = isAdmin(owner) ? (
    <LinkWrapper href={`/w/${owner.sId}/model-providers`} className="underline">
      Model providers
    </LinkWrapper>
  ) : (
    <>Contact your workspace admin.</>
  );
  const variant =
    subscription.plan.code === FREE_BYOK_TRANSITIONING_PLAN_CODE
      ? "info"
      : "warning";

  const hasConfiguredProviders = Object.keys(providersHealth).length > 0;
  const hasConfiguredEmbeddingProvider =
    providersHealth[DEFAULT_EMBEDDING_PROVIDER_ID] !== undefined;
  const isWorkspaceHealthy = Object.values(providersHealth).every(Boolean);

  let description: string | null = null;
  if (!hasConfiguredProviders) {
    description =
      "No provider credentials configured. Please set up at least one model provider.";
  } else if (!hasConfiguredEmbeddingProvider) {
    description = "Please set up your OpenAI credentials.";
  } else if (!isWorkspaceHealthy) {
    description =
      "The following model providers have invalid credentials: " +
      Object.entries(providersHealth)
        .filter(([_, isHealthy]) => !isHealthy)
        .map(
          ([providerId]) =>
            PRETTIFIED_PROVIDER_NAMES[providerId as ByokModelProviderIdType]
        )
        .join(", ") +
      ".";
  } else {
    return null;
  }

  return (
    <StatusBanner
      title={title}
      description={description}
      variant={variant}
      footer={footer}
    />
  );
}

function SubscriptionPastDueBanner() {
  return (
    <StatusBanner
      variant="warning"
      title="Your payment has failed!"
      description={
        <>
          <br />
          Please make sure to update your payment method in the Admin section to
          maintain access to your workspace. We will retry in a few days.
          <br />
          <br />
          After 3 attempts, your workspace will be downgraded to the free plan.
          Connections will be deleted and members will be revoked. Details{" "}
          <LinkWrapper
            href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription"
            target="_blank"
            className="underline"
          >
            here
          </LinkWrapper>
          .
        </>
      }
    />
  );
}

interface WorkspaceUsageStatusBannerProps {
  owner: LightWorkspaceType;
}

function WorkspaceUsageStatusBanner({
  owner,
}: WorkspaceUsageStatusBannerProps) {
  const { poolCreditState, programmaticCreditStatus, balanceThresholdReached } =
    useWorkspaceUsageStatus({ owner });

  // The low/critical pool states are internal throttling signals and are not
  // surfaced. Admins are alerted when the pool is fully depleted (agents
  // blocked) or when it has run into pay-as-you-go overage.
  const isPoolDepleted = poolCreditState === "depleted";
  const isPoolOverage = poolCreditState === "overage";

  // When the contract sells seats that carry personal credits (pro/max/free),
  // those users spend their own credits before the shared pool and keep working
  // even when the pool is depleted/in overage (mirrors the personal-seat
  // carve-out in `isUserBlocked`). The pool banner's "out of credits / agents
  // blocked" message would be misleading there, so we suppress it. Only fetch
  // the contract (a Metronome API call) when the banner would otherwise show.
  const poolStateWouldBanner =
    isAdmin(owner) && (isPoolDepleted || isPoolOverage);
  const { contract, isMetronomeContractLoading } = useMetronomeContract({
    workspaceId: owner.sId,
    disabled: !poolStateWouldBanner,
  });
  const showPoolBanner =
    poolStateWouldBanner &&
    !isMetronomeContractLoading &&
    !contract?.hasPersonalCreditSeats;
  // A cap of 0 is a deliberate hard block on programmatic API, not an
  // exhausted budget, so its "cap reached" banner is suppressed. The cap is
  // only fetched when the banner would otherwise show.
  const programmaticStateWouldBanner =
    isAdmin(owner) && programmaticCreditStatus !== "active";
  const { programmaticUsageLimit, isProgrammaticUsageLimitLoading } =
    useProgrammaticUsageLimit({
      workspaceId: owner.sId,
      disabled: !programmaticStateWouldBanner,
    });
  const showProgrammaticBanner =
    programmaticStateWouldBanner &&
    !isProgrammaticUsageLimitLoading &&
    programmaticUsageLimit?.monthlyCapCredits !== 0;
  // The admin-configured balance-threshold warning is only relevant before the
  // pool is depleted/overage — those states have their own (stronger) banner.
  const showBalanceThresholdBanner =
    isAdmin(owner) &&
    balanceThresholdReached &&
    !isPoolDepleted &&
    !isPoolOverage;

  // Only a single usage banner is shown at a time, picked by priority. The
  // pool banner takes precedence over the lower-severity balance-threshold
  // warning, which is why "Your credit balance is running low" never shows
  // alongside it.
  const manageCreditsFooter = (
    <LinkWrapper href={`/w/${owner.sId}/usage`} className="underline">
      Manage credits
    </LinkWrapper>
  );

  const banner = ((): StatusBannerProps | null => {
    if (showPoolBanner) {
      return {
        variant: isPoolDepleted ? "danger" : "warning",
        title: isPoolDepleted
          ? "Your workspace is out of credits"
          : "Your workspace has used all its credits",
        description: isPoolDepleted
          ? "Your workspace has run out of credits. Agents are blocked until you top up."
          : "Your workspace has used all of its included credits and is now billed pay-as-you-go. Top up to avoid overage charges.",
        footer: manageCreditsFooter,
      };
    }

    if (showProgrammaticBanner) {
      return {
        variant: programmaticCreditStatus === "depleted" ? "danger" : "warning",
        title:
          programmaticCreditStatus === "depleted"
            ? "Programmatic API cap reached"
            : "Programmatic API cap at 80%",
        description:
          programmaticCreditStatus === "depleted"
            ? "Your workspace has exhausted its monthly programmatic API credit cap. Programmatic API calls are blocked until the billing cycle resets or the cap is raised."
            : "Your workspace has used 80% of its monthly programmatic API credit cap. Consider raising the cap to avoid interruptions.",
        footer: (
          <LinkWrapper href={`/w/${owner.sId}/usage`} className="underline">
            Manage usage
          </LinkWrapper>
        ),
      };
    }

    if (showBalanceThresholdBanner) {
      return {
        variant: "warning",
        title: "Your credit balance is running low",
        description:
          "Your workspace's remaining credit balance has dropped below the threshold you set. Top up to avoid running out of credits.",
        footer: manageCreditsFooter,
      };
    }

    return null;
  })();

  if (!banner) {
    return null;
  }

  return <StatusBanner {...banner} />;
}

export function SidebarBanners() {
  const { workspace: owner, subscription } = useAuth();
  const { appStatus } = useAppStatus();

  return (
    <>
      <WorkspaceUsageStatusBanner owner={owner} />
      <UnhealthyCredentialsBanner owner={owner} subscription={subscription} />
      {appStatus && <AppStatusBanner appStatus={appStatus} />}
      {subscription.paymentFailingSince &&
        isAdmin(owner) &&
        !isDustCompanyPlan(subscription.plan.code) &&
        !isEnterprisePlanPrefix(subscription.plan.code) && (
          <SubscriptionPastDueBanner />
        )}
    </>
  );
}
