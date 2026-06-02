import type { AppStatus } from "@app/lib/api/status";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  FREE_BYOK_TRANSITIONING_PLAN_CODE,
  isEntreprisePlanPrefix,
} from "@app/lib/plans/plan_codes";
import { useAppStatus } from "@app/lib/swr/useAppStatus";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
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

interface UsageStatusBannerProps {
  owner: LightWorkspaceType;
}

function UsageStatusBanner({ owner }: UsageStatusBannerProps) {
  const {
    awuStatus,
    poolCreditState,
    programmaticCreditState,
    programmaticWarned,
  } = useWorkspaceUsageStatus({ owner });

  // The pool balance and programmatic cap banners are only shown to admins, who
  // manage workspace credits. The AWU cap banner is shown to any user subject to
  // a usage cap. All can be displayed at the same time.
  const showPoolBanner =
    isAdmin(owner) &&
    (poolCreditState === "active_low_balance" ||
      poolCreditState === "active_critical_balance");
  const showAwuBanner = awuStatus !== "normal";
  const showProgrammaticBanner =
    isAdmin(owner) &&
    (programmaticCreditState !== "active" || programmaticWarned);

  if (!showPoolBanner && !showAwuBanner && !showProgrammaticBanner) {
    return null;
  }

  const isPoolCritical = poolCreditState === "active_critical_balance";
  const isProgrammaticDepleted = programmaticCreditState === "depleted";
  const isProgrammaticCritical =
    programmaticCreditState === "active_critical_balance";
  // 80% warning: FSM still "active" but warning flag fired from webhook.
  const isProgrammaticAtWarning =
    programmaticWarned && programmaticCreditState === "active";

  return (
    <>
      {showPoolBanner && (
        <StatusBanner
          variant={isPoolCritical ? "danger" : "warning"}
          title={
            isPoolCritical
              ? "Your workspace is critically low on credits"
              : "Your workspace is running low on credits"
          }
          description={
            isPoolCritical
              ? "Your workspace credits are almost depleted. Top up now to avoid interruptions to your agents."
              : "Your workspace credits are running low. Consider topping up to avoid interruptions to your agents."
          }
          footer={
            <LinkWrapper href={`/w/${owner.sId}/usage`} className="underline">
              Manage credits
            </LinkWrapper>
          }
        />
      )}
      {showProgrammaticBanner && (
        <StatusBanner
          variant={
            isProgrammaticDepleted || isProgrammaticCritical
              ? "danger"
              : "warning"
          }
          title={
            isProgrammaticDepleted
              ? "Your workspace's programmatic API has reached its monthly cap"
              : isProgrammaticCritical
                ? "Your workspace's programmatic API is critically close to its monthly cap"
                : isProgrammaticAtWarning
                  ? "Your workspace's programmatic API has reached 80% of its monthly cap"
                  : "Your workspace's programmatic API is approaching its monthly cap"
          }
          description={
            isProgrammaticDepleted
              ? "Programmatic API calls are now blocked until the next billing cycle or the cap is increased."
              : isProgrammaticCritical
                ? "Programmatic API calls will be blocked very soon. Increase the cap to avoid interruptions."
                : isProgrammaticAtWarning
                  ? "Programmatic API calls will be blocked when the cap is reached. Consider increasing the cap."
                  : "Programmatic API calls will be blocked when the cap is reached. Consider increasing the cap."
          }
          footer={
            <LinkWrapper href={`/w/${owner.sId}/usage`} className="underline">
              Manage credits
            </LinkWrapper>
          }
        />
      )}
      {showAwuBanner && (
        <StatusBanner
          variant={awuStatus === "blocked" ? "danger" : "warning"}
          title={
            awuStatus === "blocked"
              ? "You've reached your usage limit"
              : "You've used 80% of your usage limit"
          }
          description={
            awuStatus === "blocked"
              ? "You can no longer run agents. Contact your admin to increase your limit."
              : "Contact your admin to increase your limit before you are blocked."
          }
        />
      )}
    </>
  );
}

export function SidebarBanners() {
  const { workspace: owner, subscription } = useAuth();
  const { appStatus } = useAppStatus();

  return (
    <>
      <UsageStatusBanner owner={owner} />
      <UnhealthyCredentialsBanner owner={owner} subscription={subscription} />
      {appStatus && <AppStatusBanner appStatus={appStatus} />}
      {subscription.paymentFailingSince &&
        isAdmin(owner) &&
        !isEntreprisePlanPrefix(subscription.plan.code) && (
          <SubscriptionPastDueBanner />
        )}
    </>
  );
}
