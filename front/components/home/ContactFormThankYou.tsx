import { CheckCircleIcon } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

interface ContactFormThankYouProps {
  firstName: string;
  isQualified: boolean;
  email: string;
  lastName: string;
}

export function ContactFormThankYou({
  firstName,
  isQualified,
  email,
  lastName,
}: ContactFormThankYouProps) {
  const hasTrackedRef = useRef(false);
  const defaultTriggeredRef = useRef(false);

  // Fire qualified lead tracking event
  useEffect(() => {
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

  // Trigger Default.com scheduler for qualified leads
  // The Default.com script is already loaded in ContactForm
  useEffect(() => {
    if (!isQualified || defaultTriggeredRef.current) {
      return;
    }
    defaultTriggeredRef.current = true;

    console.log("[Default.com] Thank you page - checking for Default.com SDK");
    console.log("[Default.com] window.__default__:", window.__default__);
    console.log("[Default.com] window.Default:", window.Default);

    // Default.com should have been loaded by ContactForm
    // Try to trigger the scheduler by simulating a form submission
    // Default.com listens for form submissions and will show the scheduler

    // Wait a bit for Default.com to fully initialize
    const timeoutId = setTimeout(() => {
      console.log("[Default.com] Attempting to trigger scheduler");
      console.log(
        "[Default.com] Available methods on Default:",
        window.Default ? Object.keys(window.Default) : "Default not found"
      );

      // Try various methods that Default.com might expose
      if (window.Default) {
        // Log all available methods for debugging
        for (const key of Object.keys(window.Default)) {
          console.log(`[Default.com] Method: ${key}`, typeof (window.Default as Record<string, unknown>)[key]);
        }
      }

      // Default.com typically auto-shows after detecting a form submission
      // Since we submitted via API, we need to check if there's a way to trigger it
      // The scheduler should appear automatically if Default.com detected our form
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [isQualified, email, firstName, lastName]);

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

      {/* Default.com scheduler will appear as a popup/modal after form submission */}
      {isQualified && (
        <div id="default-scheduler-container" className="w-full min-h-[400px]" />
      )}
    </div>
  );
}
