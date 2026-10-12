import { PronounPresetChips } from "@app/components/me/PronounPresetChips";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { FAVORITE_PLATFORM_OPTIONS } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import { JOB_TYPE_OPTIONS } from "@app/types/job_type";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import { MAX_USER_PRONOUNS_LENGTH } from "@app/types/user";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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

export const JOB_TYPE_LABELS: Record<JobType, MessageDescriptor> = {
  customer_success: msg`Customer Success`,
  customer_support: msg`Customer Support`,
  data: msg({ message: "Data", context: "job function" }),
  design: msg`Design`,
  engineering: msg`Engineering`,
  finance: msg`Finance`,
  it: msg({ message: "IT", context: "job function" }),
  people: msg`People (HR)`,
  legal: msg`Legal`,
  marketing: msg`Marketing`,
  operations: msg`Operations`,
  procurement: msg`Procurement`,
  product: msg`Product`,
  revops: msg`Revenue Operations`,
  sales: msg`Sales`,
  other: msg`Other`,
};

export interface ProfileFormData {
  firstName: string;
  lastName: string;
  pronouns: string;
  jobType: JobType | null;
}

export interface ProfileFormErrors {
  firstName?: MessageDescriptor;
  lastName?: MessageDescriptor;
  pronouns?: MessageDescriptor;
  jobType?: MessageDescriptor;
}

export function validateProfileForm(data: ProfileFormData): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  if (!data.firstName.trim()) {
    errors.firstName = msg`First name is required`;
  }
  if (!data.lastName.trim()) {
    errors.lastName = msg`Last name is required`;
  }
  if (data.pronouns.trim().length > MAX_USER_PRONOUNS_LENGTH) {
    errors.pronouns = msg`Pronouns must be at most ${MAX_USER_PRONOUNS_LENGTH} characters`;
  }
  if (!data.jobType) {
    errors.jobType = msg`Please select your job type`;
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
  const { t } = useLingui();
  const firstName = formData.firstName;
  const workspaceName = owner.name;

  return (
    <div className="flex h-full flex-col gap-8 pt-4 md:justify-center md:pt-0">
      <DustLogoSquare className="-ml-11 h-10 w-32" />
      <Page.Header
        title={firstName ? t`Hello ${firstName}!` : t`Hello there!`}
      />
      <p className="text-muted-foreground">
        <Trans>Let's check a few things.</Trans>
      </p>
      {!isAdmin && (
        <p className="text-muted-foreground">
          <Trans>
            You'll be joining the workspace:{" "}
            <span className="font-medium">{workspaceName}</span>.
          </Trans>
        </p>
      )}
      <div>
        <p className="pb-2 text-muted-foreground">
          <Trans>Your name is:</Trans>
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              name="firstName"
              placeholder={t`First name`}
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
                {t(formErrors.firstName)}
              </p>
            )}
          </div>
          <div>
            <Input
              name="lastName"
              placeholder={t`Last name`}
              value={formData.lastName}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, lastName: e.target.value }))
              }
            />
            {showErrors && formErrors.lastName && (
              <p className="mt-1 text-sm text-red-500">
                {t(formErrors.lastName)}
              </p>
            )}
          </div>
        </div>
      </div>
      <div>
        <p className="pb-2 text-muted-foreground">
          <Trans>Your pronouns (optional):</Trans>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="sm:w-64">
            <Input
              name="pronouns"
              placeholder={t`Type your own`}
              value={formData.pronouns}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, pronouns: e.target.value }))
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              <Trans>Suggestions:</Trans>
            </span>
            <PronounPresetChips
              value={formData.pronouns}
              onSelect={(pronouns) =>
                setFormData((prev) => ({ ...prev, pronouns }))
              }
            />
          </div>
        </div>
        {showErrors && formErrors.pronouns && (
          <p className="mt-1 text-sm text-red-500">{t(formErrors.pronouns)}</p>
        )}
      </div>
      <div>
        <p className="pb-2 text-muted-foreground">
          <Trans>Pick your role to customize your experience:</Trans>
        </p>
        <div className="flex flex-wrap gap-2">
          {JOB_TYPE_OPTIONS.map((jobTypeOption) => (
            <Chip
              key={jobTypeOption.value}
              label={t(JOB_TYPE_LABELS[jobTypeOption.value])}
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
          <p className="mt-1 text-sm text-red-500">{t(formErrors.jobType)}</p>
        )}
      </div>
      <div className="flex justify-end">
        <Button label={t`Next`} size="md" onClick={onNext} />
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
  const { t } = useLingui();

  return (
    <div className="flex h-full flex-col gap-8 pt-4 md:justify-center md:pt-0">
      <Page.Header title={t`What are your favorite platforms?`} />
      <p className="text-muted-foreground">
        <Trans>
          Dust works at full potential when it can play with your knowledge and
          help with your tools. Do you recognise some of these?
        </Trans>
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
          label={t`Next`}
          isLoading={isSubmitting}
          disabled={isSubmitting}
          size="md"
          onClick={onSubmit}
        />
      </div>
    </div>
  );
}
