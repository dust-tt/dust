import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { usePatchUser } from "@app/lib/swr/user";
import { useWelcomeData } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import { getConversationRoute } from "@app/lib/utils/router";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { FAVORITE_PLATFORM_OPTIONS } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import { isJobType, JOB_TYPE_OPTIONS } from "@app/types/job_type";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Card,
  ConfluenceLogo,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DustLogoSquare,
  FrontLogo,
  GithubLogo,
  GmailLogo,
  HubspotLogo,
  Icon,
  Input,
  JiraLogo,
  MicrosoftOutlookLogo,
  NotionLogo,
  Page,
  SlackLogo,
  Spinner,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";

const PLATFORM_ICONS: Record<FavoritePlatform, ComponentType> = {
  gmail: GmailLogo,
  outlook: MicrosoftOutlookLogo,
  slack: SlackLogo,
  notion: NotionLogo,
  confluence: ConfluenceLogo,
  github: GithubLogo,
  hubspot: HubspotLogo,
  jira: JiraLogo,
  front: FrontLogo,
};

interface UserProfileStepProps {
  owner: WorkspaceType;
  isAdmin: boolean;
  formData: {
    firstName: string;
    lastName: string;
    jobType: JobType | null;
  };
  setFormData: React.Dispatch<
    React.SetStateAction<{
      firstName: string;
      lastName: string;
      jobType: JobType | null;
    }>
  >;
  formErrors: {
    firstName?: string;
    lastName?: string;
    jobType?: string;
  };
  showErrors: boolean;
  onNext: () => void;
}

function UserProfileStep({
  owner,
  isAdmin,
  formData,
  setFormData,
  formErrors,
  showErrors,
  onNext,
}: UserProfileStepProps) {
  const selectedJobTypeLabel = useMemo(() => {
    if (!formData.jobType) {
      return "Select job type";
    }
    const jobType = JOB_TYPE_OPTIONS.find((t) => t.value === formData.jobType);
    return jobType?.label ?? "Select job type";
  }, [formData.jobType]);

  return (
    <OnboardingLayout
      owner={owner}
      headerTitle="Joining Dust"
      headerRightActions={<Button label="Next" size="sm" onClick={onNext} />}
    >
      <div className="flex h-full flex-col gap-8 pt-4 md:justify-center md:pt-0">
        <Page.Header
          title={`Hello ${formData.firstName || "there"}!`}
          icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
        />
        <p className="text-muted-foreground dark:text-muted-foreground-night">
          Let's check a few things.
        </p>
        {!isAdmin && (
          <p className="text-muted-foreground dark:text-muted-foreground-night">
            You'll be joining the workspace:{" "}
            <span className="font-medium">{owner.name}</span>.
          </p>
        )}
        <div>
          <p className="pb-2 text-muted-foreground dark:text-muted-foreground-night">
            Your name is:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Input
                name="firstName"
                placeholder="First Name"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    firstName: e.target.value,
                  }))
                }
              />
              {showErrors && formErrors.firstName && (
                <p className="mt-1 text-sm text-red-500">
                  {formErrors.firstName}
                </p>
              )}
            </div>
            <div>
              <Input
                name="lastName"
                placeholder="Last Name"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                }
              />
              {showErrors && formErrors.lastName && (
                <p className="mt-1 text-sm text-red-500">
                  {formErrors.lastName}
                </p>
              )}
            </div>
          </div>
        </div>
        <div>
          <p className="pb-2 text-muted-foreground dark:text-muted-foreground-night">
            Pick your job type to get relevant feature updates:
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="justify-between text-muted-foreground dark:text-muted-foreground-night"
                label={selectedJobTypeLabel}
                isSelect={true}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
              <DropdownMenuRadioGroup
                value={formData.jobType ?? ""}
                onValueChange={(value) => {
                  if (isJobType(value)) {
                    setFormData((prev) => ({ ...prev, jobType: value }));
                  }
                }}
              >
                {JOB_TYPE_OPTIONS.map((jobTypeOption) => (
                  <DropdownMenuRadioItem
                    key={jobTypeOption.value}
                    value={jobTypeOption.value}
                    label={jobTypeOption.label}
                  />
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {showErrors && formErrors.jobType && (
            <p className="mt-1 text-sm text-red-500">{formErrors.jobType}</p>
          )}
        </div>
        <div className="flex justify-end">
          <Button label="Next" size="md" onClick={onNext} />
        </div>
      </div>
    </OnboardingLayout>
  );
}

interface FavoritePlatformsStepProps {
  owner: WorkspaceType;
  selectedPlatforms: Set<FavoritePlatform>;
  onTogglePlatform: (platform: FavoritePlatform) => void;
  onSubmit: React.MouseEventHandler<HTMLElement>;
  isSubmitting: boolean;
}

function FavoritePlatformsStep({
  owner,
  selectedPlatforms,
  onTogglePlatform,
  onSubmit,
  isSubmitting,
}: FavoritePlatformsStepProps) {
  return (
    <OnboardingLayout
      owner={owner}
      headerTitle="Joining Dust"
      headerRightActions={
        <Button
          label="Next"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          size="sm"
          onClick={onSubmit}
        />
      }
    >
      <div className="flex h-full flex-col gap-8 pt-4 md:justify-center md:pt-0">
        <Page.Header title="What are your favorite platforms?" />
        <p className="text-muted-foreground dark:text-muted-foreground-night">
          Dust works at full potential when it can play with your knowledge and
          help with your tools. Do you recognise some of these?
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FAVORITE_PLATFORM_OPTIONS.map((platform) => {
            const PlatformIcon = PLATFORM_ICONS[platform];
            const isSelected = selectedPlatforms.has(platform);
            return (
              <Card
                key={platform}
                variant="secondary"
                size="sm"
                selected={isSelected}
                onClick={() => onTogglePlatform(platform)}
              >
                <div className="flex items-center gap-3">
                  <Icon visual={PlatformIcon} size="md" />
                  <span className="text-sm font-medium">
                    {asDisplayName(platform)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button
            label="Next"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            size="md"
            onClick={onSubmit}
          />
        </div>
      </div>
    </OnboardingLayout>
  );
}

interface FormData {
  firstName: string;
  lastName: string;
  jobType: JobType | null;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  jobType?: string;
}

function getInitialSelectedPlatforms(
  emailProvider: EmailProviderType
): Set<FavoritePlatform> {
  const platforms = new Set<FavoritePlatform>();
  if (emailProvider === "google") {
    platforms.add("gmail");
  } else if (emailProvider === "microsoft") {
    platforms.add("outlook");
  }
  return platforms;
}

export function WelcomePage() {
  const { workspace, user, isAdmin } = useAuth();
  const router = useAppRouter();
  const { patchUser } = usePatchUser();
  const conversationId = useSearchParam("cId");

  const { welcomeData, isFirstAdmin, emailProvider, isWelcomeDataLoading } =
    useWelcomeData({ workspaceId: workspace.sId });

  const showFavoritePlatformsStep = isFirstAdmin;

  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<FormData>({
    firstName: user.firstName,
    lastName: user.lastName ?? "",
    jobType: null,
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<
    Set<FavoritePlatform>
  >(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [platformsInitialized, setPlatformsInitialized] = useState(false);

  // Initialize selectedPlatforms once emailProvider is loaded.
  useEffect(() => {
    if (welcomeData && !platformsInitialized) {
      setSelectedPlatforms(getInitialSelectedPlatforms(emailProvider));
      setPlatformsInitialized(true);
    }
  }, [welcomeData, platformsInitialized, emailProvider]);

  const validateForm = (data: FormData): FormErrors => {
    const errors: FormErrors = {};
    if (!data.firstName.trim()) {
      errors.firstName = "First name is required";
    }
    if (!data.lastName.trim()) {
      errors.lastName = "Last name is required";
    }
    if (!data.jobType) {
      errors.jobType = "Please select your job type";
    }
    return errors;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const formErrors = useMemo(() => {
    if (!showErrors) {
      return {};
    }
    return validateForm(formData);
  }, [formData, showErrors]);

  const { submit, isSubmitting } = useSubmitFunction(async () => {
    await patchUser(
      formData.firstName.trim(),
      formData.lastName.trim(),
      false,
      formData.jobType ?? undefined,
      undefined,
      showFavoritePlatformsStep ? Array.from(selectedPlatforms) : undefined,
      emailProvider,
      workspace.sId
    );

    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer ?? [];
      const utmParams = getStoredUTMParams();
      window.dataLayer.push({
        event: "signup_completed",
        user_email: user.email,
        company_name: workspace.name,
        gclid: utmParams.gclid ?? null,
        fbclid: utmParams.fbclid ?? null,
        msclkid: utmParams.msclkid ?? null,
        li_fat_id: utmParams.li_fat_id ?? null,
      });
    }

    const queryParams = `welcome=true${
      conversationId ? `&cId=${conversationId}` : ""
    }`;
    await router.push(getConversationRoute(workspace.sId, "new", queryParams));
  });

  // Show loading while fetching welcome data.
  if (isWelcomeDataLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const handleStep1Next = () => {
    setShowErrors(true);
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      return;
    }
    if (showFavoritePlatformsStep) {
      setStep(2);
    } else {
      void submit();
    }
  };

  const togglePlatform = (platform: FavoritePlatform) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  const handleStep2Submit = withTracking(
    TRACKING_AREAS.AUTH,
    "onboarding_complete",
    () => {
      void submit();
    }
  );

  if (step === 1) {
    return (
      <UserProfileStep
        owner={workspace}
        isAdmin={isAdmin}
        formData={formData}
        setFormData={setFormData}
        formErrors={formErrors}
        showErrors={showErrors}
        onNext={handleStep1Next}
      />
    );
  }

  return (
    <FavoritePlatformsStep
      owner={workspace}
      selectedPlatforms={selectedPlatforms}
      onTogglePlatform={togglePlatform}
      onSubmit={handleStep2Submit}
      isSubmitting={isSubmitting}
    />
  );
}
