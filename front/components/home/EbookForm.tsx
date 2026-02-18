import { FormProvider } from "@app/components/sparkle/FormProvider";
import type {
  EbookFormData,
  EbookSubmitResponse,
  TrackingParams,
} from "@app/lib/api/hubspot/ebookFormSchema";
import { EbookFormSchema } from "@app/lib/api/hubspot/ebookFormSchema";
import { clientFetch } from "@app/lib/egress/client";
import { useGeolocation } from "@app/lib/swr/geo";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Button, Checkbox, Input, Label, Spinner } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useController, useForm } from "react-hook-form";

function useEbookFormSubmit() {
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (data: EbookFormData): Promise<void> => {
    setSubmitError(null);

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

    try {
      const response = await clientFetch("/api/ebook/submit", {
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

      const result: EbookSubmitResponse = await response.json();

      if (!response.ok || !result.success) {
        setSubmitError(
          result.error ?? "Failed to submit form. Please try again."
        );
        return;
      }

      // Push GTM event
      if (typeof window !== "undefined") {
        window.dataLayer = window.dataLayer ?? [];
        const consentMarketing = data.consent_marketing ?? false;
        window.dataLayer.push({
          event: "ebook_form_submitted",
          user_email: consentMarketing ? data.email : undefined,
          user_first_name: consentMarketing ? data.firstname : undefined,
          user_last_name: consentMarketing ? data.lastname : undefined,
          consent_marketing: consentMarketing,
          gclid: tracking.gclid,
          fbclid: tracking.fbclid,
          msclkid: tracking.msclkid,
          li_fat_id: tracking.li_fat_id,
          utm_source: tracking.utm_source,
          utm_medium: tracking.utm_medium,
          utm_campaign: tracking.utm_campaign,
          utm_content: tracking.utm_content,
          utm_term: tracking.utm_term,
        });
      }

      setDownloadToken(result.downloadToken ?? null);
    } catch (err) {
      const error = normalizeError(err);
      setSubmitError(error.message || "An error occurred. Please try again.");
    }
  };

  return { downloadToken, submitError, handleSubmit };
}

function MarketingConsentCheckbox() {
  const { field } = useController<EbookFormData>({
    name: "consent_marketing",
  });

  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="ebook_consent_marketing"
        checked={field.value === true}
        onCheckedChange={(checked) => field.onChange(checked === true)}
        className="mt-0.5"
      />
      <Label
        htmlFor="ebook_consent_marketing"
        className="cursor-pointer text-sm font-normal leading-tight"
      >
        I consent to receive marketing communications from Dust about products,
        services, and events.
      </Label>
    </div>
  );
}

export function EbookForm() {
  const { downloadToken, submitError, handleSubmit } = useEbookFormSubmit();
  const { geoData, isGeoDataLoading } = useGeolocation();

  const form = useForm<EbookFormData>({
    resolver: zodResolver(EbookFormSchema),
    defaultValues: {
      email: "",
      firstname: "",
      lastname: "",
      company: "",
      jobtitle: "",
      consent_marketing: false,
    },
    mode: "onBlur",
  });

  const [showMarketingConsent, setShowMarketingConsent] = useState(true);

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

  if (downloadToken) {
    return (
      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-white p-8">
        <h3 className="text-2xl font-semibold text-foreground">
          Thank you! Your ebook is ready.
        </h3>
        <p className="text-muted-foreground">
          Click the button below to download your copy of The Connected
          Enterprise AI Playbook.
        </p>
        <Button
          label="Download Ebook"
          variant="primary"
          size="md"
          href={`/api/ebook/download?token=${encodeURIComponent(downloadToken)}`}
          target="_blank"
        />
      </div>
    );
  }

  return (
    <FormProvider form={form} onSubmit={handleSubmit}>
      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-white p-8">
        <h3 className="text-xl font-semibold text-foreground">
          Get your free copy
        </h3>

        {/* First Name / Last Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        {/* Company Name */}
        <Input
          label="Company Name"
          {...form.register("company")}
          placeholder=""
          isError={!!errors.company}
          message={errors.company?.message}
        />

        {/* Job Title */}
        <Input
          label="Job Title"
          {...form.register("jobtitle")}
          placeholder=""
          isError={!!errors.jobtitle}
          message={errors.jobtitle?.message}
        />

        {/* Marketing Consent Checkbox - only shown in GDPR countries */}
        {showMarketingConsent && <MarketingConsentCheckbox />}

        {/* Disclaimer */}
        <div className="text-xs text-muted-foreground">
          By submitting this form, you consent to Dust processing your personal
          data to respond to your request. Please review our{" "}
          <a
            href="https://dust.tt/home/platform-privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Privacy Policy
          </a>
          .
        </div>

        {submitError && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <Button
          type="submit"
          label={isSubmitting ? "Submitting..." : "Download the Ebook"}
          variant="primary"
          size="md"
          disabled={isSubmitting}
          icon={isSubmitting ? Spinner : undefined}
        />
      </div>
    </FormProvider>
  );
}
