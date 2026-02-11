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
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useController, useForm } from "react-hook-form";

import { ContactFormThankYou } from "@app/components/home/ContactFormThankYou";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import type {
  ContactFormData,
  ContactSubmitResponse,
  TrackingParams,
} from "@app/lib/api/hubspot/contactFormSchema";
import {
  COMPANY_HEADCOUNT_FORM_OPTIONS,
  ContactFormSchema,
  HEADQUARTERS_REGION_OPTIONS,
  LANGUAGE_OPTIONS,
} from "@app/lib/api/hubspot/contactFormSchema";
import { clientFetch } from "@app/lib/egress/client";
import { useGeolocation } from "@app/lib/swr/geo";
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface ContactFormProps {
  prefillEmail?: string;
  prefillHeadcount?: string;
  prefillRegion?: string;
}

function useContactFormSubmit() {
  const [submitResult, setSubmitResult] =
    useState<ContactSubmitResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (data: ContactFormData): Promise<void> => {
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

    // Track form submission attempt
    trackEvent({
      area: TRACKING_AREAS.CONTACT,
      object: "contact_form",
      action: "submit_attempt",
    });

    try {
      const response = await clientFetch("/api/contact/submit", {
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

      const result: ContactSubmitResponse = await response.json();

      if (!response.ok || !result.success) {
        setSubmitError(
          result.error ?? "Failed to submit form. Please try again."
        );
        return;
      }

      // Track successful submission
      trackEvent({
        area: TRACKING_AREAS.CONTACT,
        object: "contact_form",
        action: "submit_success",
      });

      // Push GTM event with qualification status, form details, and tracking params
      // Only include PII if user has consented to marketing
      if (typeof window !== "undefined") {
        window.dataLayer = window.dataLayer ?? [];
        const consentMarketing = data.consent_marketing ?? false;
        window.dataLayer.push({
          event: "contact_form_submitted",
          is_qualified: result.isQualified,
          user_email: consentMarketing ? data.email : undefined,
          user_phone: consentMarketing ? data.mobilephone : undefined,
          user_first_name: consentMarketing ? data.firstname : undefined,
          user_last_name: consentMarketing ? data.lastname : undefined,
          user_language: data.language,
          user_headquarters_region: data.headquarters_region,
          user_company_headcount: data.company_headcount_form,
          consent_marketing: consentMarketing,
          gclid: tracking.gclid,
          utm_source: tracking.utm_source,
          utm_medium: tracking.utm_medium,
          utm_campaign: tracking.utm_campaign,
          utm_content: tracking.utm_content,
          utm_term: tracking.utm_term,
        });
      }

      // Scroll to top so the thank you message is visible
      window.scrollTo({ top: 0, behavior: "smooth" });

      setSubmitResult(result);
    } catch (err) {
      const error = normalizeError(err);
      setSubmitError(error.message || "An error occurred. Please try again.");
    }
  };

  return { submitResult, submitError, handleSubmit };
}

interface DropdownFieldProps {
  name: keyof ContactFormData;
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
  const { field, fieldState } = useController<ContactFormData>({ name });
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

function MarketingConsentCheckbox() {
  const { field } = useController<ContactFormData>({
    name: "consent_marketing",
  });

  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="consent_marketing"
        checked={field.value === true}
        onCheckedChange={(checked) => field.onChange(checked === true)}
        className="mt-0.5"
      />
      <Label
        htmlFor="consent_marketing"
        className="cursor-pointer text-sm font-normal leading-tight"
      >
        I consent to receive marketing communications from Dust about products,
        services, and events.
      </Label>
    </div>
  );
}

export function ContactForm({
  prefillEmail,
  prefillHeadcount,
  prefillRegion,
}: ContactFormProps) {
  const { submitResult, submitError, handleSubmit } = useContactFormSubmit();
  const { geoData, isGeoDataLoading } = useGeolocation();

  const form = useForm<ContactFormData>({
    resolver: zodResolver(ContactFormSchema),
    defaultValues: {
      firstname: "",
      lastname: "",
      email: prefillEmail ?? "",
      mobilephone: "",
      language: "",
      headquarters_region: prefillRegion ?? "",
      company_headcount_form: prefillHeadcount ?? "",
      landing_use_cases: "",
      consent_marketing: false,
    },
    mode: "onBlur",
  });

  // Show checkbox by default (safe for SSR and GDPR).
  // Once geo data loads, hide it for non-GDPR and set consent to true.
  const [showMarketingConsent, setShowMarketingConsent] = useState(true);

  // With getStaticProps, router.query is empty on first render.
  // Set prefilled values once they become available.
  useEffect(() => {
    const { dirtyFields } = form.formState;
    if (prefillEmail && !dirtyFields.email) {
      form.setValue("email", prefillEmail);
    }
    if (prefillHeadcount && !dirtyFields.company_headcount_form) {
      form.setValue("company_headcount_form", prefillHeadcount);
    }
    if (prefillRegion && !dirtyFields.headquarters_region) {
      form.setValue("headquarters_region", prefillRegion);
    }
  }, [prefillEmail, prefillHeadcount, prefillRegion, form]);

  useEffect(() => {
    if (!isGeoDataLoading && geoData) {
      if (!geoData.isGDPR) {
        setShowMarketingConsent(false);
        if (!form.formState.dirtyFields.consent_marketing) {
          form.setValue("consent_marketing", true);
        }
      }
    }
  }, [geoData, isGeoDataLoading, form]);
  const { isSubmitting, errors } = form.formState;

  return (
    <FormProvider form={form} onSubmit={handleSubmit}>
      {submitResult ? (
        <ContactFormThankYou isQualified={submitResult.isQualified} />
      ) : (
        <div id="dust-contact-form" className="flex flex-col gap-6">
          {/* First Name / Last Name */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Input
              label="First Name"
              {...form.register("firstname")}
              placeholder=""
              isError={!!errors.firstname}
              message={errors.firstname?.message}
            />
            <Input
              label="Last Name"
              {...form.register("lastname")}
              placeholder=""
              isError={!!errors.lastname}
              message={errors.lastname?.message}
            />
          </div>

          {/* Work Email */}
          <div className="flex flex-col gap-2">
            <Label>
              Work Email<span className="text-red-500">*</span>
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

          {/* Phone Number */}
          <Input
            label="Phone Number"
            {...form.register("mobilephone")}
            placeholder="+1 (555) 000-0000"
            type="tel"
            isError={!!errors.mobilephone}
            message={errors.mobilephone?.message}
          />

          {/* Language */}
          <DropdownField
            name="language"
            label="Language you'd like to use"
            options={LANGUAGE_OPTIONS}
            placeholder="Select language"
            required
          />

          {/* Headquarters Region */}
          <DropdownField
            name="headquarters_region"
            label="Headquarters Region"
            options={HEADQUARTERS_REGION_OPTIONS}
            placeholder="Select region"
          />

          {/* Company Headcount */}
          <DropdownField
            name="company_headcount_form"
            label="Company Headcount"
            options={COMPANY_HEADCOUNT_FORM_OPTIONS}
            placeholder="Select headcount"
            required
          />

          {/* How do you want to use Dust? */}
          <div className="flex flex-col gap-2">
            <Label>How do you want to use Dust?</Label>
            <TextArea
              {...form.register("landing_use_cases")}
              rows={4}
              placeholder=""
            />
          </div>

          {/* Marketing Consent Checkbox - only shown in GDPR countries */}
          {showMarketingConsent && <MarketingConsentCheckbox />}

          {/* Disclaimer */}
          <div className="text-xs text-muted-foreground">
            <p className="mb-2">
              By submitting this form, you consent to Dust processing your
              personal data to respond to your contact request. Dust uses your
              contact information to communicate with you about our products and
              services. You may unsubscribe at any time. Please review our{" "}
              <a
                href="https://dust.tt/home/platform-privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Privacy Policy
              </a>{" "}
              to learn about our privacy practices, data protection measures,
              and unsubscribe procedures.
            </p>
            <p>
              Dust serves certain geographic regions and customer segments
              exclusively through our certified partner network. When you submit
              an inquiry from these regions, your contact information will be
              directed to the appropriate authorized partner who will handle
              your evaluation, purchase, and implementation.
            </p>
          </div>

          {submitError && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <Button
            type="submit"
            label={isSubmitting ? "Submitting..." : "Submit"}
            variant="primary"
            size="md"
            disabled={isSubmitting}
            icon={isSubmitting ? Spinner : undefined}
          />
        </div>
      )}
    </FormProvider>
  );
}
