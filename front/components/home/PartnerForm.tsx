import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useController, useForm } from "react-hook-form";

import { PartnerFormThankYou } from "@app/components/home/PartnerFormThankYou";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import type { TrackingParams } from "@app/lib/api/hubspot/contactFormSchema";
import type {
  PartnerFormData,
  PartnerSubmitResponse,
} from "@app/lib/api/hubspot/partnerFormSchema";
import {
  HEADQUARTERS_REGION_OPTIONS,
  PARTNER_IS_DUST_USER_OPTIONS,
  PartnerFormSchema,
  STEP_1_FIELDS,
  STEP_2_FIELDS,
  STEP_3_FIELDS,
} from "@app/lib/api/hubspot/partnerFormSchema";
import { clientFetch } from "@app/lib/egress/client";
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const STEP_TITLES = [
  "Become a Partner",
  "About a partnership",
  "About your customers",
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
      const response = await clientFetch("/api/partner/submit", {
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

      window.scrollTo({ top: 0, behavior: "smooth" });

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
}

function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  const progressPercent = (currentStep / totalSteps) * 100;

  return (
    <div className="mb-8">
      <div className="mb-2 flex justify-between text-sm text-muted-foreground">
        <span>
          Step {currentStep} of {totalSteps}
        </span>
        <span>{STEP_TITLES[currentStep - 1]}</span>
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
      <div className="w-fit">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={selectedOption?.label ?? placeholder}
              variant="outline"
              size="md"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
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

interface RadioFieldProps {
  name: keyof PartnerFormData;
  label: string;
  options: readonly { value: string; label: string }[];
  required?: boolean;
}

function RadioField({
  name,
  label,
  options,
  required = false,
}: RadioFieldProps) {
  const { field, fieldState } = useController<PartnerFormData>({ name });

  return (
    <div className="flex flex-col gap-3">
      <Label>
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="flex gap-4">
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <input
              type="radio"
              id={`${name}-${option.value}`}
              name={name}
              value={option.value}
              checked={field.value === option.value}
              onChange={() => field.onChange(option.value)}
              className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
            />
            <Label
              htmlFor={`${name}-${option.value}`}
              className="cursor-pointer font-normal"
            >
              {option.label}
            </Label>
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
    resolver: zodResolver(PartnerFormSchema),
    defaultValues: {
      firstname: "",
      lastname: "",
      email: "",
      company: "",
      company_size: "",
      headquarters_region: "",
      partner_type: "",
      partner_services: "",
      partner_is_dust_user: "",
      partner_additionnal_details: "",
      partner_customer_sizes: "",
      enterprise_tool_stack: "",
      any_existing_lead_to_share_: "",
    },
    mode: "onBlur",
  });

  const { isSubmitting, errors } = form.formState;

  const getFieldsForStep = (step: number): (keyof PartnerFormData)[] => {
    switch (step) {
      case 1:
        return [...STEP_1_FIELDS];
      case 2:
        return [...STEP_2_FIELDS];
      case 3:
        return [...STEP_3_FIELDS];
      default:
        return [];
    }
  };

  const handleNext = async () => {
    const fieldsToValidate = getFieldsForStep(currentStep);
    const isValid = await form.trigger(fieldsToValidate);

    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderStepFields = () => {
    switch (currentStep) {
      case 1:
        return (
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

            {/* Company Size */}
            <div className="flex flex-col gap-2">
              <Label>
                Company Size<span className="text-red-500">*</span>
              </Label>
              <Input
                {...form.register("company_size")}
                placeholder="e.g., 50-200 employees"
                isError={!!errors.company_size}
                message={errors.company_size?.message}
              />
            </div>

            {/* Headquarters Region */}
            <DropdownField
              name="headquarters_region"
              label="What's your regional focus?"
              options={HEADQUARTERS_REGION_OPTIONS}
              placeholder="Select region"
              required
            />
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col gap-6">
            {/* Partner Type */}
            <div className="flex flex-col gap-2">
              <Label>
                Which partner type most closely describes your company?
                <span className="text-red-500">*</span>
              </Label>
              <Input
                {...form.register("partner_type")}
                placeholder="e.g., Reseller, Implementation Partner, Technology Partner"
                isError={!!errors.partner_type}
                message={errors.partner_type?.message}
              />
            </div>

            {/* Partnership Vision */}
            <div className="flex flex-col gap-2">
              <Label>
                How would you envision a partnership with Dust?
                <span className="text-red-500">*</span>
              </Label>
              <TextArea
                {...form.register("partner_services")}
                rows={4}
                placeholder=""
              />
              {errors.partner_services && (
                <p className="text-sm text-red-500">
                  {errors.partner_services.message}
                </p>
              )}
            </div>

            {/* Existing Dust User */}
            <RadioField
              name="partner_is_dust_user"
              label="Are you an existing Dust user?"
              options={PARTNER_IS_DUST_USER_OPTIONS}
              required
            />

            {/* Additional Details */}
            <div className="flex flex-col gap-2">
              <Label>Any details you'd like to give?</Label>
              <TextArea
                {...form.register("partner_additionnal_details")}
                rows={3}
                placeholder=""
              />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col gap-6">
            {/* Partner Customer Sizes */}
            <div className="flex flex-col gap-2">
              <Label>
                What's the typical size of your client companies?
                <span className="text-red-500">*</span>
              </Label>
              <Input
                {...form.register("partner_customer_sizes")}
                placeholder="e.g., 100-1000 employees, Enterprise (5000+)"
                isError={!!errors.partner_customer_sizes}
                message={errors.partner_customer_sizes?.message}
              />
            </div>

            {/* Enterprise Tool Stack */}
            <div className="flex flex-col gap-2">
              <Label>
                What is their typical Enterprise Tool Stack?
                <span className="text-red-500">*</span>
              </Label>
              <Input
                {...form.register("enterprise_tool_stack")}
                placeholder="e.g., Microsoft 365, Google Workspace, Salesforce, Slack"
                isError={!!errors.enterprise_tool_stack}
                message={errors.enterprise_tool_stack?.message}
              />
            </div>

            {/* First Opportunity */}
            <div className="flex flex-col gap-2">
              <Label>Do you have a first opportunity in mind?</Label>
              <TextArea
                {...form.register("any_existing_lead_to_share_")}
                rows={4}
                placeholder=""
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <FormProvider form={form} onSubmit={handleSubmit}>
      {submitResult ? (
        <PartnerFormThankYou />
      ) : (
        <div id="dust-partner-form" className="flex flex-col gap-6">
          <StepIndicator currentStep={currentStep} totalSteps={3} />

          {renderStepFields()}

          {/* Disclaimer - only show on last step */}
          {currentStep === 3 && (
            <div className="text-xs text-muted-foreground">
              <p>
                By submitting this form, you consent to Dust processing your
                personal data to evaluate your partnership application. Dust
                uses your contact information to communicate with you about
                partnership opportunities. Please review our{" "}
                <a
                  href="https://dust.tt/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Privacy Policy
                </a>{" "}
                to learn about our privacy practices.
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
            {currentStep < 3 ? (
              <Button
                type="button"
                label="Next"
                variant="primary"
                size="md"
                onClick={handleNext}
              />
            ) : (
              <Button
                type="submit"
                label={isSubmitting ? "Submitting..." : "Submit"}
                variant="primary"
                size="md"
                disabled={isSubmitting}
                icon={isSubmitting ? Spinner : undefined}
              />
            )}
          </div>
        </div>
      )}
    </FormProvider>
  );
}
