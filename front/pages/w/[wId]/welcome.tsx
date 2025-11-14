import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DustLogoSquare,
  Input,
  Page,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import config from "@app/lib/api/config";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import { usePatchUser } from "@app/lib/swr/user";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getConversationRoute } from "@app/lib/utils/router";
import type { UserType, WorkspaceType } from "@app/types";
import type { JobType } from "@app/types/job_type";
import { isJobType, JOB_TYPE_OPTIONS } from "@app/types/job_type";

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  user: UserType;
  owner: WorkspaceType;
  isAdmin: boolean;
  conversationId: string | null;
  baseUrl: string;
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
  // If user was in onboarding flow "domain_conversation_link"
  // We will redirect to the conversation page after onboarding.
  const conversationId =
    typeof context.query.cId === "string" ? context.query.cId : null;

  return {
    props: {
      user: user.toJSON(),
      owner,
      isAdmin,
      conversationId,
      baseUrl: config.getClientFacingUrl(),
    },
  };
});

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

export default function Welcome({
  user,
  owner,
  isAdmin,
  conversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { patchUser } = usePatchUser();

  const [formData, setFormData] = useState<FormData>({
    firstName: user.firstName,
    lastName: user.lastName ?? "",
    jobType: null,
  });

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

  const { submit, isSubmitting } = useSubmitFunction(async () => {
    setShowErrors(true);

    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      return;
    }
    await patchUser(
      formData.firstName.trim(),
      formData.lastName.trim(),
      false,
      formData.jobType ?? undefined
    );

    // GTM signup event tracking: only fire after successful submit
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: "signup_completed",
        user_email: user.email,
        company_name: owner.name,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        gclid: sessionStorage.getItem("gclid") || null,
      });
    }

    const queryParams = `welcome=true${
      conversationId ? `&cId=${conversationId}` : ""
    }`;
    await router.push(getConversationRoute(owner.sId, "new", queryParams));
  });

  const handleSubmit = withTracking(
    TRACKING_AREAS.AUTH,
    "onboarding_complete",
    () => {
      void submit();
    }
  );

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
      headerRightActions={
        <Button
          label="Next"
          disabled={isSubmitting}
          size="sm"
          onClick={handleSubmit}
        />
      }
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
          <div>
            <p className="text-muted-foreground dark:text-muted-foreground-night">
              You'll be joining the workspace:{" "}
              <span className="font-medium">{owner.name}</span>.
            </p>
          </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
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
                <p className="mt-1 text-sm text-red-500">
                  {formErrors.jobType}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            label="Next"
            disabled={isSubmitting}
            size="md"
            onClick={handleSubmit}
          />
        </div>
      </div>
    </OnboardingLayout>
  );
}
