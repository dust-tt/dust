import { CheckCircleIcon } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { FIELD_DEFINITIONS } from "@app/components/home/contactFormSchema";
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

// Default.com configuration
const DEFAULT_FORM_ID = 130084;
const DEFAULT_TEAM_ID = 579;

// Type for Default.com SDK
interface DefaultSDK {
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
    default?: {
      sdk: DefaultSDK;
    };
  }
}

// Convert our field definitions to Default.com's questions format
function toDefaultQuestions(fields: typeof FIELD_DEFINITIONS) {
  return fields.map((field) => ({
    id: field.name,
    name: field.label,
    type: field.type === "dropdown" ? "select" : field.type,
    options: "options" in field ? field.options?.map((opt) => opt.value) : undefined,
  }));
}

interface ContactFormThankYouProps {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  language: string;
  headquartersRegion: string;
  companyHeadcount: string;
  howToUseDust: string;
  isQualified: boolean;
}

export function ContactFormThankYou({
  firstName,
  lastName,
  email,
  phone,
  language,
  headquartersRegion,
  companyHeadcount,
  howToUseDust,
  isQualified,
}: ContactFormThankYouProps) {
  const hasTrackedRef = useRef(false);
  const defaultTriggeredRef = useRef(false);

  // Fire qualified lead tracking event
  useEffect(() => {
    if (isQualified && !hasTrackedRef.current) {
      hasTrackedRef.current = true;

      const timeoutId = setTimeout(() => {
        trackEvent({
          area: TRACKING_AREAS.CONTACT,
          object: "contact_form",
          action: "qualified_lead",
        });

        if (typeof window !== "undefined") {
          window.dataLayer = window.dataLayer ?? [];
          window.dataLayer.push({
            event: "contact_form_qualified_lead",
          });
        }
      }, 1500);

      return () => clearTimeout(timeoutId);
    }
  }, [isQualified]);

  // Load Default.com SDK and submit form data for qualified leads
  useEffect(() => {
    if (!isQualified || defaultTriggeredRef.current) {
      return;
    }
    defaultTriggeredRef.current = true;

    // Load the Default.com SDK script
    const script = document.createElement("script");
    script.src = "https://import-cdn.default.com/sdk.js";
    script.async = true;

    script.onload = () => {
      // Wait a moment for the SDK to initialize
      setTimeout(() => {
        if (window.default?.sdk) {
          window.default.sdk.submit({
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
            onSchedulerDisplayed: () => {
              // Scheduler is now visible
            },
            onMeetingBooked: () => {
              trackEvent({
                area: TRACKING_AREAS.CONTACT,
                object: "contact_form",
                action: "meeting_booked",
              });
            },
          });
        }
      }, 500);
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup script if component unmounts
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [
    isQualified,
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
        {isQualified
          ? "We're excited to show you Dust. Book a time with our team below."
          : "We've received your request. Our team will be in touch soon."}
      </p>

    </div>
  );
}
