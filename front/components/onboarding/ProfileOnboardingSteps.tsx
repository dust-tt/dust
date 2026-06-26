import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { FAVORITE_PLATFORM_OPTIONS } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import { JOB_TYPE_OPTIONS } from "@app/types/job_type";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Card,
  Chip,
  ConfluenceLogo,
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
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

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

export interface ProfileFormData {
  firstName: string;
  lastName: string;
  jobType: JobType | null;
}

export interface ProfileFormErrors {
  firstName?: string;
  lastName?: string;
  jobType?: string;
}

export function validateProfileForm(data: ProfileFormData): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
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
}

export function getInitialSelectedPlatforms(
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

interface UserProfileStepProps {
  owner: WorkspaceType;
  isAdmin: boolean;
  formData: ProfileFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  formErrors: ProfileFormErrors;
  showErrors: boolean;
  onNext: () => void;
}

export function UserProfileStep({
  owner,
  isAdmin,
  formData,
  setFormData,
  formErrors,
  showErrors,
  onNext,
}: UserProfileStepProps) {
  return (
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
              <p className="mt-1 text-sm text-red-500">{formErrors.lastName}</p>
            )}
          </div>
        </div>
      </div>
      <div>
        <p className="pb-2 text-muted-foreground dark:text-muted-foreground-night">
          Pick your role to customize your experience:
        </p>
        <div className="flex flex-wrap gap-2">
          {JOB_TYPE_OPTIONS.map((jobTypeOption) => (
            <Chip
              key={jobTypeOption.value}
              label={jobTypeOption.label}
              size="xs"
              color={
                formData.jobType === jobTypeOption.value
                  ? "highlight"
                  : "primary"
              }
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  jobType: jobTypeOption.value,
                }))
              }
            />
          ))}
        </div>
        {showErrors && formErrors.jobType && (
          <p className="mt-1 text-sm text-red-500">{formErrors.jobType}</p>
        )}
      </div>
      <div className="flex justify-end">
        <Button label="Next" size="md" onClick={onNext} />
      </div>
    </div>
  );
}

interface FavoritePlatformsStepProps {
  selectedPlatforms: Set<FavoritePlatform>;
  onTogglePlatform: (platform: FavoritePlatform) => void;
  onSubmit: React.MouseEventHandler<HTMLElement>;
  isSubmitting: boolean;
}

export function FavoritePlatformsStep({
  selectedPlatforms,
  onTogglePlatform,
  onSubmit,
  isSubmitting,
}: FavoritePlatformsStepProps) {
  return (
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
  );
}
