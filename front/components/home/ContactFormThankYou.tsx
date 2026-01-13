import { CheckCircleIcon } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

// Default.com configuration
const DEFAULT_FORM_ID = 503792;
const DEFAULT_TEAM_ID = 579;

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
  const defaultInitializedRef = useRef(false);

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

  // Load Default.com SDK for qualified leads (webform integration)
  useEffect(() => {
    console.log("[Default.com] useEffect triggered", {
      isQualified,
      defaultInitialized: defaultInitializedRef.current,
    });

    if (!isQualified || defaultInitializedRef.current) {
      console.log("[Default.com] Skipping - not qualified or already initialized");
      return;
    }
    defaultInitializedRef.current = true;

    // Initialize Default.com SDK configuration
    window.__default__ = window.__default__ ?? {};
    window.__default__.form_id = DEFAULT_FORM_ID;
    window.__default__.team_id = DEFAULT_TEAM_ID;

    console.log("[Default.com] Initialized __default__", window.__default__);

    // Load the Default.com script
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://import-cdn.default.com/v2/index.js";

    script.onload = () => {
      console.log("[Default.com] Script loaded");
      console.log("[Default.com] window.Default:", window.Default);
      console.log(
        "[Default.com] Available methods:",
        window.Default ? Object.keys(window.Default) : "Default not found"
      );

      // After SDK loads, identify the lead and trigger scheduler
      // Default.com webform integration expects form submission data
      if (window.Default?.identify) {
        console.log("[Default.com] Calling identify with:", {
          email,
          first_name: firstName,
          last_name: lastName,
        });
        window.Default.identify({
          email,
          first_name: firstName,
          last_name: lastName,
        });
      } else {
        console.log("[Default.com] identify method not found");
      }

      if (window.Default?.book) {
        console.log("[Default.com] Calling book()");
        window.Default.book();
      } else {
        console.log("[Default.com] book method not found");
      }
    };

    script.onerror = (error) => {
      console.error("[Default.com] Script failed to load:", error);
    };

    document.head.appendChild(script);
    console.log("[Default.com] Script appended to head");

    return () => {
      script.remove();
    };
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

      {/* Default.com SDK will render the scheduler here */}
      {isQualified && (
        <div id="default-scheduler-container" className="w-full" />
      )}
    </div>
  );
}
