import { Button, CheckCircleIcon } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

interface ContactFormThankYouProps {
  firstName: string;
  isQualified: boolean;
  schedulingUrl?: string;
}

export function ContactFormThankYou({
  firstName,
  isQualified,
  schedulingUrl,
}: ContactFormThankYouProps) {
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    // Fire qualified lead event only once, after a short delay
    // This delay allows the thank you page to render before the conversion fires
    if (isQualified && !hasTrackedRef.current) {
      hasTrackedRef.current = true;

      // Delay the qualified lead event to ensure it fires after the page is visible
      const timeoutId = setTimeout(() => {
        // Track in PostHog
        trackEvent({
          area: TRACKING_AREAS.CONTACT,
          object: "contact_form",
          action: "qualified_lead",
        });

        // Push qualified lead event to GTM
        // This is the conversion event that should be used for paid campaign tracking
        if (typeof window !== "undefined") {
          window.dataLayer = window.dataLayer ?? [];
          window.dataLayer.push({
            event: "contact_form_qualified_lead",
          });
        }
      }, 1500); // 1.5 second delay

      return () => clearTimeout(timeoutId);
    }
  }, [isQualified]);

  const handleScheduleClick = () => {
    trackEvent({
      area: TRACKING_AREAS.CONTACT,
      object: "contact_form",
      action: "schedule_click",
    });

    if (schedulingUrl) {
      window.location.href = schedulingUrl;
    }
  };

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
          ? "We're excited to show you Dust. Book a time with our team to get started."
          : "We've received your request. Our team will be in touch soon."}
      </p>

      {isQualified && schedulingUrl && (
        <Button
          label="Schedule your demo"
          variant="primary"
          size="md"
          onClick={handleScheduleClick}
        />
      )}
    </div>
  );
}
