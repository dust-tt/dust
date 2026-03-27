import { PartnerFormThankYou } from "@app/components/home/PartnerFormThankYou";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import type { TrackingParams } from "@app/lib/api/hubspot/contactFormSchema";
import type {
  PartnerFormData,
  PartnerSubmitResponse,
} from "@app/lib/api/hubspot/partnerFormSchema";
import {
  COMPANY_INDUSTRY_OPTIONS,
  HEADQUARTERS_REGION_OPTIONS,
  PARTNER_AI_PROFICIENCY_OPTIONS,
  PARTNER_BUSINESS_MODEL_OPTIONS,
  PARTNER_DUST_USAGE_DURATION_OPTIONS,
  PARTNER_PROJECT_DURATION_OPTIONS,
} from "@app/lib/api/hubspot/partnerFormSchema";
import { clientFetch } from "@app/lib/egress/client";
import { TRACKING_AREAS, trackEvent } from "@app/lib/tracking";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

const PARTNER_FORM_FIELDS = new Set<string>([
  "firstname",
  "lastname",
  "email",
  "company",
  "hs_linkedin_url",
  "partner_business_model",
  "headquarters_region",
  "company_industry",
  "partner_customer_sizes",
  "partner_project_duration",
  "technical_staff",
  "partner_ai_proficiency",
  "partner_dust_usage_duration",
  "partner_agent_example",
  "partner_dust_clients",
  "any_existing_lead_to_share_",
  "partner_additionnal_details",
  "partner_other_partnerhips",
]);

function isPartnerFormField(value: unknown): value is keyof PartnerFormData {
  return typeof value === "string" && PARTNER_FORM_FIELDS.has(value);
}

// Business models that trigger the conditional Business Profile step
const BUSINESS_PROFILE_MODELS = new Set([
  "I help clients implement and optimize AI tools",
  "I build integrations or complementary products",
]);

function needsBusinessProfile(businessModel: string): boolean {
  return BUSINESS_PROFILE_MODELS.has(businessModel);
}

const PARTNER_CUSTOMER_SIZE_OPTIONS = [
  { value: "1-200", label: "1-200" },
  { value: "201-1000", label: "201-1000" },
  { value: "1000-5000", label: "1000-5000" },
  { value: "5000+", label: "5000+" },
] as const;

// Per-step validation schemas (only validate the current step's fields)
const Step1Schema = z.object({
  firstname: z.string().min(1, "First Name is required"),
  lastname: z.string().min(1, "Last Name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  company: z.string().min(1, "Company Name is required"),
  hs_linkedin_url: z.string().min(1, "LinkedIn URL is required"),
  partner_business_model: z.string().min(1, "Please select a business model"),
});

const BusinessProfileSchema = z.object({
  headquarters_region: z.string().optional(),
  company_industry: z.string().optional(),
  partner_customer_sizes: z.string().optional(),
  partner_project_duration: z.string().optional(),
  technical_staff: z.string().optional(),
  partner_ai_proficiency: z.string().optional(),
});

const LastStepSchema = z.object({
  partner_dust_usage_duration: z.string().min(1, "Please select a duration"),
  partner_agent_example: z
    .string()
    .min(1, "Please share your favorite Dust Agent"),
  partner_dust_clients: z
    .string()
    .min(1, "Please enter the number of Dust clients")
    .regex(/^\d+$/, "Please enter a valid number"),
  any_existing_lead_to_share_: z
    .string()
    .min(1, "Please describe a first opportunity"),
  partner_additionnal_details: z
    .string()
    .min(1, "Please describe how you envision a partnership"),
});

const STEP_SCHEMAS = {
  step1: Step1Schema,
  businessProfile: BusinessProfileSchema,
  lastStep: LastStepSchema,
} as const;

const STEP_TITLES = [
  "Become a Partner",
  "Business Profile",
  "Dust and you",
] as const;

function usePartnerFormSubmit() {
  const [submitResult, setSubmitResult] =
    useState<PartnerSubmitResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (data: PartnerFormData): Promise<void> => {
    setSubmitError(null);

    // Get tracking params from sessionStorage
    const storedParams = getStoredUTMParams();
    const tracking: TrackingParams = {
      utm_source: storedParams.utm_source,
      utm_medium: storedParams.utm_medium,
      utm_campaign: storedParams.utm_campaign,
      utm_content: storedParams.utm_content,
      utm_term: storedParams.utm_term,
      gclid: storedParams.gclid,
      fbclid: storedParams.fbclid,
      msclkid: storedParams.msclkid,
      li_fat_id: storedParams.li_fat_id,
    };

    trackEvent({
      area: TRACKING_AREAS.CONTACT,
      object: "partner_form",
      action: "submit_attempt",
    });

    try {
      const response = await clientFetch("/api/home/partner/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formData: data,
          tracking,
          pageUri: window.location.href,
          pageName: document.title,
        }),
      });

      const result: PartnerSubmitResponse = await response.json();

      if (!response.ok || !result.success) {
        setSubmitError(
          result.error ?? "Failed to submit form. Please try again."
        );
        return;
      }

      trackEvent({
        area: TRACKING_AREAS.CONTACT,
        object: "partner_form",
        action: "submit_success",
      });

      setSubmitResult(result);
    } catch (err) {
      const error = normalizeError(err);
      setSubmitError(error.message || "An error occurred. Please try again.");
    }
  };

  return { submitResult, submitError, handleSubmit };
}

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepTitle: string;
}

function StepIndicator({
  currentStep,
  totalSteps,
  stepTitle,
}: StepIndicatorProps) {
  const progressPercent = (currentStep / totalSteps) * 100;

  return (
    <div className="mb-8">
      <div className="mb-2 flex justify-between text-sm text-muted-foreground">
        <span>
          Step {currentStep} of {totalSteps}
        </span>
        <span>{stepTitle}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300 ease-in-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

interface DropdownFieldProps {
  name: keyof PartnerFormData;
  label: string;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  required?: boolean;
}

function DropdownField({
  name,
  label,
  options,
  placeholder,
  required = false,
}: DropdownFieldProps) {
  const { field, fieldState } = useController<PartnerFormData>({ name });
  const selectedOption = options.find((opt) => opt.value === field.value);

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="w-full">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={selectedOption?.label ?? placeholder}
              variant="outline"
              size="md"
              isSelect
              className="w-full justify-between"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {options.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => field.onChange(option.value)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {fieldState.error && (
        <p className="text-sm text-red-500">{fieldState.error.message}</p>
      )}
    </div>
  );
}

interface CheckboxGroupFieldProps {
  name: "partner_customer_sizes";
  label: string;
  options: readonly { value: string; label: string }[];
  required?: boolean;
}

function CheckboxGroupField({
  name,
  label,
  options,
  required = false,
}: CheckboxGroupFieldProps) {
  const { field, fieldState } = useController<PartnerFormData>({ name });
  // Store as semicolon-separated string (HubSpot multi-select format)
  const fieldValue = typeof field.value === "string" ? field.value : "";
  const selectedValues: string[] = fieldValue ? fieldValue.split(";") : [];

  const handleToggle = (value: string) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    field.onChange(newValues.join(";"));
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              checked={selectedValues.includes(option.value)}
              onCheckedChange={() => handleToggle(option.value)}
            />
            <Label className="font-normal">{option.label}</Label>
          </div>
        ))}
      </div>
      {fieldState.error && (
        <p className="text-sm text-red-500">{fieldState.error.message}</p>
      )}
    </div>
  );
}

export function PartnerForm() {
  const { submitResult, submitError, handleSubmit } = usePartnerFormSubmit();
  const [currentStep, setCurrentStep] = useState(1);

  const form = useForm<PartnerFormData>({
    defaultValues: {
      firstname: "",
      lastname: "",
      email: "",
      company: "",
      hs_linkedin_url: "",
      partner_business_model: "",
      headquarters_region: "",
      company_industry: "",
      partner_customer_sizes: "",
      partner_project_duration: "",
      technical_staff: "",
      partner_ai_proficiency: "",
      partner_dust_usage_duration: "",
      partner_agent_example: "",
      partner_dust_clients: "",
      any_existing_lead_to_share_: "",
      partner_additionnal_details: "",
      partner_other_partnerhips: "",
    },
  });

  const { isSubmitting, errors } = form.formState;
  const businessModel = form.watch("partner_business_model");
  const hasBusinessProfile = needsBusinessProfile(businessModel);
  const totalSteps = hasBusinessProfile ? 3 : 2;

  // Map the visual step number to the actual step content
  const getStepContent = (
    step: number
  ): "step1" | "businessProfile" | "lastStep" => {
    if (step === 1) {
      return "step1";
    }
    if (hasBusinessProfile && step === 2) {
      return "businessProfile";
    }
    return "lastStep";
  };

  const getStepTitle = (step: number): string => {
    const content = getStepContent(step);
    switch (content) {
      case "step1":
        return STEP_TITLES[0];
      case "businessProfile":
        return STEP_TITLES[1];
      case "lastStep":
        return STEP_TITLES[2];
    }
  };

  const handleNext = () => {
    const stepContent = getStepContent(currentStep);
    const schema = STEP_SCHEMAS[stepContent];
    const values = form.getValues();

    form.clearErrors();

    const result = schema.safeParse(values);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (isPartnerFormField(field)) {
          form.setError(field, { message: issue.message });
        }
      }
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    document
      .getElementById("dust-partner-form")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    document
      .getElementById("dust-partner-form")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const renderStep1Fields = () => (
    <div className="flex flex-col gap-6">
      {/* First Name / Last Name */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>
            First Name<span className="text-red-500">*</span>
          </Label>
          <Input
            {...form.register("firstname")}
            placeholder=""
            isError={!!errors.firstname}
            message={errors.firstname?.message}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>
            Last Name<span className="text-red-500">*</span>
          </Label>
          <Input
            {...form.register("lastname")}
            placeholder=""
            isError={!!errors.lastname}
            message={errors.lastname?.message}
          />
        </div>
      </div>

      {/* Email */}
      <div className="flex flex-col gap-2">
        <Label>
          Email<span className="text-red-500">*</span>
        </Label>
        <Input
          {...form.register("email")}
          placeholder=""
          type="email"
          isError={!!errors.email}
          message={errors.email?.message}
          messageStatus={errors.email ? "error" : undefined}
        />
      </div>

      {/* Company Name */}
      <div className="flex flex-col gap-2">
        <Label>
          Company Name<span className="text-red-500">*</span>
        </Label>
        <Input
          {...form.register("company")}
          placeholder=""
          isError={!!errors.company}
          message={errors.company?.message}
        />
      </div>

      {/* LinkedIn URL */}
      <div className="flex flex-col gap-2">
        <Label>
          LinkedIn URL<span className="text-red-500">*</span>
        </Label>
        <Input
          {...form.register("hs_linkedin_url")}
          placeholder=""
          isError={!!errors.hs_linkedin_url}
          message={errors.hs_linkedin_url?.message}
        />
      </div>

      {/* Business Model */}
      <DropdownField
        name="partner_business_model"
        label="What is your main business model?"
        options={PARTNER_BUSINESS_MODEL_OPTIONS}
        placeholder="Select business model"
        required
      />
    </div>
  );

  const renderBusinessProfileFields = () => (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold">Business Profile</h2>

      {/* Regional Focus */}
      <DropdownField
        name="headquarters_region"
        label="What's your regional focus?"
        options={HEADQUARTERS_REGION_OPTIONS}
        placeholder="Select region"
      />

      {/* Industry */}
      <div className="flex flex-col gap-1">
        <DropdownField
          name="company_industry"
          label="What industry do you specialize in?"
          options={COMPANY_INDUSTRY_OPTIONS}
          placeholder="Select industry"
        />
        <p className="text-sm text-muted-foreground">
          Please choose one. It helps us hand pick leads for you.
        </p>
      </div>

      {/* Client Company Sizes */}
      <CheckboxGroupField
        name="partner_customer_sizes"
        label="What's the typical size of your client companies?"
        options={PARTNER_CUSTOMER_SIZE_OPTIONS}
      />

      {/* Project Duration */}
      <DropdownField
        name="partner_project_duration"
        label="What is your average project duration?"
        options={PARTNER_PROJECT_DURATION_OPTIONS}
        placeholder="Select duration"
      />

      {/* Technical Staff */}
      <div className="flex flex-col gap-2">
        <Label>
          How many technical staff do you have dedicated to implementations?
        </Label>
        <Input
          {...form.register("technical_staff")}
          type="number"
          min="0"
          placeholder="eg. 10"
          isError={!!errors.technical_staff}
          message={errors.technical_staff?.message}
        />
      </div>

      {/* AI Proficiency */}
      <DropdownField
        name="partner_ai_proficiency"
        label="What's the current level of your team on AI?"
        options={PARTNER_AI_PROFICIENCY_OPTIONS}
        placeholder="Select level"
      />
    </div>
  );

  const renderLastStepFields = () => (
    <div className="flex flex-col gap-6">
      {/* Dust Usage Duration */}
      <DropdownField
        name="partner_dust_usage_duration"
        label="How long have you been using Dust?"
        options={PARTNER_DUST_USAGE_DURATION_OPTIONS}
        placeholder="Select duration"
        required
      />

      {/* Favorite Dust Agent */}
      <div className="flex flex-col gap-2">
        <Label>
          Share your favorite Dust Agent you&apos;ve built
          <span className="text-red-500">*</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Please copy the link of a conversation with it. We&apos;re curious to
          meet it!
        </p>
        <Input
          {...form.register("partner_agent_example")}
          placeholder=""
          isError={!!errors.partner_agent_example}
          message={errors.partner_agent_example?.message}
        />
      </div>

      {/* Dust Clients Count */}
      <div className="flex flex-col gap-2">
        <Label>
          How many Dust clients do you currently have?
          <span className="text-red-500">*</span>
        </Label>
        <Input
          {...form.register("partner_dust_clients")}
          type="number"
          min="0"
          placeholder="eg. 3"
          isError={!!errors.partner_dust_clients}
          message={errors.partner_dust_clients?.message}
        />
      </div>

      {/* First Opportunity */}
      <div className="flex flex-col gap-2">
        <Label>
          Do you have a first opportunity in mind?
          <span className="text-red-500">*</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Please briefly describe the opportunity (company size, use case,
          timeline)
        </p>
        <Input
          {...form.register("any_existing_lead_to_share_")}
          placeholder="eg. Coca Cola, 1300 employees, deployment for their"
          isError={!!errors.any_existing_lead_to_share_}
          message={errors.any_existing_lead_to_share_?.message}
        />
      </div>

      {/* Partnership Vision */}
      <div className="flex flex-col gap-2">
        <Label>
          How would you envision a partnership with Dust?
          <span className="text-red-500">*</span>
        </Label>
        <TextArea
          {...form.register("partner_additionnal_details")}
          rows={4}
          placeholder=""
        />
        {errors.partner_additionnal_details && (
          <p className="text-sm text-red-500">
            {errors.partner_additionnal_details.message}
          </p>
        )}
      </div>

      {/* Other Partnerships */}
      <div className="flex flex-col gap-2">
        <Label>
          Are you a partner for any other tools? and AI or Agentic tools? (If
          yes, list them below)
        </Label>
        <Input
          {...form.register("partner_other_partnerhips")}
          placeholder=""
          isError={!!errors.partner_other_partnerhips}
          message={errors.partner_other_partnerhips?.message}
        />
      </div>
    </div>
  );

  const renderStepFields = () => {
    const content = getStepContent(currentStep);
    switch (content) {
      case "step1":
        return renderStep1Fields();
      case "businessProfile":
        return renderBusinessProfileFields();
      case "lastStep":
        return renderLastStepFields();
    }
  };

  const onSubmit = () => {
    const values = form.getValues();
    const lastStepContent = getStepContent(totalSteps);
    const schema = STEP_SCHEMAS[lastStepContent];

    form.clearErrors();

    const result = schema.safeParse(values);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (isPartnerFormField(field)) {
          form.setError(field, { message: issue.message });
        }
      }
      return;
    }

    void handleSubmit({
      ...values,
      technical_staff: values.technical_staff || "-99",
    });
  };

  return (
    <FormProvider form={form} asForm={false}>
      {submitResult ? (
        <PartnerFormThankYou />
      ) : (
        <div id="dust-partner-form" className="flex flex-col gap-6">
          <StepIndicator
            currentStep={currentStep}
            totalSteps={totalSteps}
            stepTitle={getStepTitle(currentStep)}
          />

          {renderStepFields()}

          {/* Disclaimer - only show on last step */}
          {currentStep === totalSteps && (
            <div className="text-sm italic text-muted-foreground">
              <p>
                Dust uses your contact information to communicate with you about
                our products and services. You may unsubscribe at any time.
                Please review our{" "}
                <a
                  href="https://dust.tt/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Privacy Policy
                </a>{" "}
                to learn about our privacy practices, data protection measures,
                and unsubscribe procedures.
              </p>
            </div>
          )}

          {submitError && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <div className="flex gap-4">
            {currentStep > 1 && (
              <Button
                type="button"
                label="Back"
                variant="outline"
                size="md"
                onClick={handleBack}
              />
            )}
            {currentStep < totalSteps ? (
              <Button
                type="button"
                label="Next"
                variant="primary"
                size="md"
                onClick={handleNext}
              />
            ) : (
              <Button
                type="button"
                label={isSubmitting ? "Submitting..." : "Submit"}
                variant="primary"
                size="md"
                disabled={isSubmitting}
                icon={isSubmitting ? Spinner : undefined}
                onClick={onSubmit}
              />
            )}
          </div>
        </div>
      )}
    </FormProvider>
  );
}
