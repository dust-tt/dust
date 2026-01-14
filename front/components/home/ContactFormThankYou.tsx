import { CheckCircleIcon } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

// Default.com configuration (must match ContactForm)
const DEFAULT_FORM_ID = 503792;

interface ContactFormThankYouProps {
  firstName: string;
  isQualified: boolean;
}

export function ContactFormThankYou({
  firstName,
  isQualified,
}: ContactFormThankYouProps) {
  const hasTrackedRef = useRef(false);
  const defaultTriggeredRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

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

  // Trigger Default.com popup for qualified leads
  useEffect(() => {
    if (!isQualified || defaultTriggeredRef.current) {
      return;
    }
    defaultTriggeredRef.current = true;

    // Wait a moment for the thank you page to render, then trigger Default.com
    const timeoutId = setTimeout(() => {
      console.log("[Default.com] Triggering popup from thank you page");
      console.log("[Default.com] window.__default__:", window.__default__);

      // Dispatch a submit event on our hidden form to trigger Default.com
      if (formRef.current) {
        const submitEvent = new Event("submit", {
          bubbles: true,
          cancelable: true,
        });
        formRef.current.dispatchEvent(submitEvent);
        console.log("[Default.com] Submit event dispatched");
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [isQualified]);

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

      {/* Hidden form for Default.com to attach to */}
      {isQualified && (
        <form
          ref={formRef}
          data-default-form-id={DEFAULT_FORM_ID}
          className="hidden"
          onSubmit={(e) => e.preventDefault()}
        />
      )}
    </div>
  );
}
