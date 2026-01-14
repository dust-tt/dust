import { CheckCircleIcon } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

// Default.com configuration
const DEFAULT_FORM_ID = 130084;
const DEFAULT_TEAM_ID = 579;
// This is the HTML form ID that must be registered in Default.com's "Connected HTML Form IDs"
const DUST_CONTACT_FORM_ID = "dust-contact-thankyou-form";

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

  // Load Default.com script and trigger popup for qualified leads
  useEffect(() => {
    if (!isQualified || defaultTriggeredRef.current) {
      return;
    }
    defaultTriggeredRef.current = true;

    // Initialize Default.com configuration
    window.__default__ = window.__default__ ?? {};
    window.__default__.form_id = DEFAULT_FORM_ID;
    window.__default__.team_id = DEFAULT_TEAM_ID;
    window.__default__.email = email;
    window.__default__.first_name = firstName;
    window.__default__.last_name = lastName;

    console.log("[Default.com] Initializing with config:", window.__default__);

    const triggerFormSubmit = () => {
      // Give Default.com time to set up its form listeners
      setTimeout(() => {
        if (formRef.current) {
          console.log("[Default.com] Form element:", formRef.current);
          console.log("[Default.com] Form ID:", formRef.current.id);
          console.log("[Default.com] Form data-default-form-id:", formRef.current.getAttribute("data-default-form-id"));
          console.log("[Default.com] Form fields:", {
            email: formRef.current.querySelector('input[name="email"]')?.getAttribute("value"),
            firstname: formRef.current.querySelector('input[name="firstname"]')?.getAttribute("value"),
          });
          console.log("[Default.com] window.__default__:", window.__default__);
          console.log("[Default.com] window.Default:", window.Default);

          console.log("[Default.com] Dispatching submit event on form");
          const submitEvent = new Event("submit", {
            bubbles: true,
            cancelable: true,
          });
          const dispatched = formRef.current.dispatchEvent(submitEvent);
          console.log("[Default.com] Event dispatched, default prevented:", !dispatched);
        } else {
          console.error("[Default.com] formRef.current is null!");
        }
      }, 1000);
    };

    // Check if script is already loaded
    const existingScript = document.querySelector(
      'script[src*="default.com"]'
    );

    if (existingScript) {
      console.log("[Default.com] Script already loaded");
      triggerFormSubmit();
    } else {
      // Load the Default.com script
      const script = document.createElement("script");
      script.src = "https://import-cdn.default.com/sdk.js";
      script.async = true;
      script.onload = () => {
        console.log("[Default.com] Script loaded successfully");
        triggerFormSubmit();
      };
      script.onerror = () => {
        console.error("[Default.com] Failed to load script");
      };
      document.body.appendChild(script);
    }
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

      {/* Hidden form for Default.com - the ID must be registered in Default.com's dashboard */}
      {isQualified && (
        <form
          ref={formRef}
          id={DUST_CONTACT_FORM_ID}
          data-default-form-id={DEFAULT_FORM_ID}
          style={{ position: "absolute", left: "-9999px", opacity: 0 }}
          onSubmit={(e) => e.preventDefault()}
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="firstname" value={firstName} />
          <input type="hidden" name="lastname" value={lastName} />
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="language" value={language} />
          <input type="hidden" name="headquarters_region" value={headquartersRegion} />
          <input type="hidden" name="company_headcount_form" value={companyHeadcount} />
          <input type="hidden" name="how_to_use_dust" value={howToUseDust} />
        </form>
      )}
    </div>
  );
}
