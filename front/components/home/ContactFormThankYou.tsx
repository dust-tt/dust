import type { ContactFormData } from "@app/lib/api/hubspot/contactFormSchema";
import { FIELD_DEFINITIONS } from "@app/lib/api/hubspot/contactFormSchema";
import { TRACKING_AREAS, trackEvent } from "@app/lib/tracking";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { CheckCircleIcon } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";

// Default.com configuration
const DEFAULT_FORM_ID = 130084;
const DEFAULT_TEAM_ID = 579;

// Type for Default.com SDK (exposed as window.DefaultSDK)
interface DefaultSDKInstance {
  submit: (options: {
    form_id: number;
    team_id: number;
    responses: Record<string, string | number | boolean>;
    questions: Array<{
      id: string;
      name: string;
      type: string;
      options?: string[];
    }>;
    onSuccess?: (data: { schedulerUrl?: string }) => void;
    onError?: (error: unknown) => void;
    onSchedulerDisplayed?: () => void;
    onSchedulerClosed?: () => void;
    onMeetingBooked?: () => void;
  }) => void;
}

declare global {
  interface Window {
    DefaultSDK?: DefaultSDKInstance;
  }
}

// Convert our field definitions to Default.com's questions format
function toDefaultQuestions(fields: typeof FIELD_DEFINITIONS) {
  return fields.map((field) => ({
    id: field.name,
    name: field.label,
    type: field.type === "dropdown" ? "select" : field.type,
    options:
      "options" in field ? field.options?.map((opt) => opt.value) : undefined,
  }));
}

interface ContactFormThankYouProps {
  isQualified: boolean;
}

export function ContactFormThankYou({ isQualified }: ContactFormThankYouProps) {
  const { getValues } = useFormContext<ContactFormData>();
  const formValues = getValues();

  const firstName = formValues.firstname ?? "";
  const lastName = formValues.lastname ?? "";
  const email = formValues.email ?? "";
  const phone = formValues.mobilephone ?? "";
  const language = formValues.language ?? "";
  const headquartersRegion = formValues.headquarters_region ?? "";
  const companyHeadcount = formValues.company_headcount_form ?? "";
  const howToUseDust = formValues.landing_use_cases ?? "";
  const consentMarketing = formValues.consent_marketing ?? false;

  // Get tracking params from sessionStorage for dataLayer
  const storedParams = getStoredUTMParams();
  const gclid = storedParams.gclid;
  const fbclid = storedParams.fbclid;
  const msclkid = storedParams.msclkid;
  const liFatId = storedParams.li_fat_id;
  const utmSource = storedParams.utm_source;
  const utmMedium = storedParams.utm_medium;
  const utmCampaign = storedParams.utm_campaign;
  const utmContent = storedParams.utm_content;
  const utmTerm = storedParams.utm_term;

  const hasTrackedRef = useRef(false);
  const defaultTriggeredRef = useRef(false);

  // Fire qualified lead tracking event
  useEffect(() => {
    if (isQualified && !hasTrackedRef.current) {
      hasTrackedRef.current = true;

      trackEvent({
        area: TRACKING_AREAS.CONTACT,
        object: "contact_form",
        action: "qualified_lead",
      });

      // Only include PII if user has consented to marketing
      if (typeof window !== "undefined") {
        window.dataLayer = window.dataLayer ?? [];
        window.dataLayer.push({
          event: "contact_form_qualified_lead",
          user_email: consentMarketing ? email : undefined,
          user_phone: consentMarketing ? phone : undefined,
          user_first_name: consentMarketing ? firstName : undefined,
          user_last_name: consentMarketing ? lastName : undefined,
          user_language: language,
          user_headquarters_region: headquartersRegion,
          user_company_headcount: companyHeadcount,
          consent_marketing: consentMarketing,
          gclid,
          fbclid,
          msclkid,
          li_fat_id: liFatId,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
          utm_term: utmTerm,
        });
      }
    }
  }, [
    isQualified,
    consentMarketing,
    email,
    phone,
    firstName,
    lastName,
    language,
    headquartersRegion,
    companyHeadcount,
    gclid,
    fbclid,
    msclkid,
    liFatId,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
  ]);

  // Load Default.com SDK and submit form data for all leads
  useEffect(() => {
    if (defaultTriggeredRef.current) {
      return;
    }
    defaultTriggeredRef.current = true;

    // Load the Default.com SDK script
    const script = document.createElement("script");
    script.src = "https://import-cdn.default.com/sdk.js";
    script.async = true;

    script.onload = () => {
      // Poll for SDK availability with max retries
      const maxRetries = 10;
      const pollIntervalMs = 100;
      let attempts = 0;

      const trySubmit = () => {
        if (window.DefaultSDK) {
          window.DefaultSDK.submit({
            form_id: DEFAULT_FORM_ID,
            team_id: DEFAULT_TEAM_ID,
            responses: {
              email,
              firstname: firstName,
              lastname: lastName,
              mobilephone: phone,
              language,
              headquarters_region: headquartersRegion,
              company_headcount_form: companyHeadcount,
              landing_use_cases: howToUseDust,
            },
            questions: toDefaultQuestions(FIELD_DEFINITIONS),
            onError: (error) => {
              logger.error({ error }, "[Default.com] SDK submission error");
            },
            onMeetingBooked: () => {
              trackEvent({
                area: TRACKING_AREAS.CONTACT,
                object: "contact_form",
                action: "meeting_booked",
              });
            },
          });
        } else if (attempts < maxRetries) {
          attempts++;
          setTimeout(trySubmit, pollIntervalMs);
        } else {
          logger.error("[Default.com] SDK not found after max retries");
        }
      };

      trySubmit();
    };

    script.onerror = (error) => {
      logger.error({ error }, "[Default.com] Failed to load SDK script");
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup script if component unmounts
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [
    email,
    firstName,
    lastName,
    phone,
    language,
    headquartersRegion,
    companyHeadcount,
    howToUseDust,
  ]);

  return (
    <div className="flex flex-col gap-6 py-8">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
          <CheckCircleIcon className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">
          Thank you{firstName ? `, ${firstName}` : ""}!
        </h2>
      </div>

      <p className="text-lg text-muted-foreground">
        We're excited to show you Dust. Book a time with our team below.
      </p>
    </div>
  );
}
