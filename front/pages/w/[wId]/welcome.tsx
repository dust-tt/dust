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
  GoogleLogo,
  HubspotLogo,
  Icon,
  Input,
  JiraLogo,
  MicrosoftLogo,
  NotionLogo,
  Page,
  SlackLogo,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import config from "@app/lib/api/config";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import { usePatchUser } from "@app/lib/swr/user";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import { detectEmailProvider } from "@app/lib/utils/email_provider_detection";
import { getConversationRoute } from "@app/lib/utils/router";
import type { UserType, WorkspaceType } from "@app/types";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { FAVORITE_PLATFORM_OPTIONS } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import { isJobType, JOB_TYPE_OPTIONS } from "@app/types/job_type";

const PLATFORM_ICONS: Record<FavoritePlatform, ComponentType> = {
  google: GoogleLogo,
  microsoft: MicrosoftLogo,
  slack: SlackLogo,
  notion: NotionLogo,
  confluence: ConfluenceLogo,
  github: GithubLogo,
  hubspot: HubspotLogo,
  jira: JiraLogo,
  front: FrontLogo,
};

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  user: UserType;
  owner: WorkspaceType;
  isAdmin: boolean;
  conversationId: string | null;
  baseUrl: string;
  emailProvider: EmailProviderType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user || !auth.isUser()) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }
  const isAdmin = auth.isAdmin();
  const conversationId =
    typeof context.query.cId === "string" ? context.query.cId : null;

  const userJson = user.toJSON();
  const emailProvider = await detectEmailProvider(
    userJson.email,
    `user-${userJson.sId}`
  );

  return {
    props: {
      user: userJson,
      owner,
      isAdmin,
      conversationId,
      baseUrl: config.getClientFacingUrl(),
      emailProvider,
    },
  };
});

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
            const PlatformIcon = PLATFORM_ICONS[platform.value];
            const isSelected = selectedPlatforms.has(platform.value);
            return (
              <Card
                key={platform.value}
                variant="secondary"
                size="sm"
                selected={isSelected}
                onClick={() => onTogglePlatform(platform.value)}
              >
                <div className="flex items-center gap-3">
                  <Icon visual={PlatformIcon} size="md" />
                  <span className="text-sm font-medium">{platform.label}</span>
                </div>
              </Card>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button
            label="Next"
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
    platforms.add("google");
  } else if (emailProvider === "microsoft") {
    platforms.add("microsoft");
  }
  return platforms;
}

export default function Welcome({
  user,
  owner,
  isAdmin,
  conversationId,
  emailProvider,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { patchUser } = usePatchUser();

  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<FormData>({
    firstName: user.firstName,
    lastName: user.lastName ?? "",
    jobType: null,
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<
    Set<FavoritePlatform>
  >(() => getInitialSelectedPlatforms(emailProvider));
  const [showErrors, setShowErrors] = useState(false);

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

  const formErrors = useMemo(() => {
    if (!showErrors) {
      return {};
    }
    return validateForm(formData);
  }, [formData, showErrors]);

  const handleStep1Next = () => {
    setShowErrors(true);
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setStep(2);
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

  const { submit, isSubmitting } = useSubmitFunction(async () => {
    await patchUser(
      formData.firstName.trim(),
      formData.lastName.trim(),
      false,
      formData.jobType ?? undefined,
      undefined,
      Array.from(selectedPlatforms),
      emailProvider
    );

    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer ?? [];
      window.dataLayer.push({
        event: "signup_completed",
        user_email: user.email,
        company_name: owner.name,
        gclid: sessionStorage.getItem("gclid") ?? null,
      });
    }

    const queryParams = `welcome=true${
      conversationId ? `&cId=${conversationId}` : ""
    }`;
    await router.push(getConversationRoute(owner.sId, "new", queryParams));
  });

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
        owner={owner}
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
      owner={owner}
      selectedPlatforms={selectedPlatforms}
      onTogglePlatform={togglePlatform}
      onSubmit={handleStep2Submit}
      isSubmitting={isSubmitting}
    />
  );
}
