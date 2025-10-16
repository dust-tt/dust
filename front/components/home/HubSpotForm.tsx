import React, { useEffect } from "react";

import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";

declare global {
  interface Window {
    hbspt?: {
      forms: {
        create: (config: {
          region: string;
          portalId: string;
          formId: string;
          target: string;
          onFormReady?: ($form: unknown) => void;
          onFormSubmitted?: () => void;
        }) => void;
      };
    };
    __default__?: {
      form_id?: number;
      team_id?: number;
      listenToIds?: string[];
    };
  }
}

export default function HubSpotForm() {
  const region = "eu1";
  const portalId = "144442587";
  const formId = "95a83867-b22c-440a-8ba0-2733d35e4a7b";

  useEffect(() => {
    // Use only the v2 script for simplicity and reliability
    const scriptSrc = `https://js.hsforms.net/forms/v2.js`;

    let formCreated = false;

    // Set up global console.log interceptor immediately
    // This will catch Default.com logs even from eval'd contexts
    let submissionTracked = false;

    // Store original console methods
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;

    // Override console.log
    console.log = function (...args) {
      // Check for Default.com submission
      if (!submissionTracked && args.length > 0) {
        const message = args[0]?.toString() || "";
        if (
          message.includes("[Default.com]") &&
          message.includes("Submitted Form")
        ) {
          submissionTracked = true;
          // Use original console to avoid recursion
          originalConsoleInfo.call(
            console,
            "[HubSpotForm] Default.com submission detected!"
          );
          trackEvent({
            area: TRACKING_AREAS.CONTACT,
            object: "hubspot_form",
            action: "submitted",
          });
        }
      }

      return originalConsoleLog.apply(console, args);
    };

    // Also override console.info in case Default.com uses it
    console.info = function (...args) {
      // Check for Default.com submission
      if (!submissionTracked && args.length > 0) {
        const message = args[0]?.toString() || "";
        if (
          message.includes("[Default.com]") &&
          message.includes("Submitted Form")
        ) {
          submissionTracked = true;
          originalConsoleInfo.call(
            console,
            "[HubSpotForm] Default.com submission detected!"
          );
          trackEvent({
            area: TRACKING_AREAS.CONTACT,
            object: "hubspot_form",
            action: "submitted",
          });
        }
      }

      return originalConsoleInfo.apply(console, args);
    };

    // Simple tracking setup function
    const setupTracking = () => {
      const container = document.getElementById("hubspotForm");
      if (!container) {
        return;
      }

      // Track form ready
      trackEvent({
        area: TRACKING_AREAS.CONTACT,
        object: "hubspot_form",
        action: "ready",
      });
    };

    const createForm = () => {
      if (formCreated) {
        return;
      }

      const formContainer = document.getElementById("hubspotForm");
      if (!formContainer) {
        return;
      }

      // Check if form already exists
      const existingForm = formContainer.querySelector("form");
      const existingIframe = formContainer.querySelector("iframe");
      if (existingForm ?? existingIframe) {
        formCreated = true;
        setupTracking(); // Set up tracking for existing form
        return;
      }

      if (window.hbspt?.forms?.create) {
        formCreated = true;

        window.hbspt.forms.create({
          region,
          portalId,
          formId,
          target: "#hubspotForm",
          onFormReady: () => {
            setupTracking();
          },
          onFormSubmitted: () => {
            // Don't track here since Default.com intercepts the submission
            // The console interceptor will catch it
          },
        });

        // Use MutationObserver as fallback if onFormReady doesn't fire
        const observer = new MutationObserver((mutations, obs) => {
          const container = document.getElementById("hubspotForm");
          if (!container) {
            return;
          }

          const form = container.querySelector("form");
          const iframe = container.querySelector("iframe");

          if (form ?? iframe) {
            obs.disconnect();
            setupTracking();
          }
        });

        const container = document.getElementById("hubspotForm");
        if (container) {
          observer.observe(container, { childList: true, subtree: true });
          setTimeout(() => observer.disconnect(), 5000);
        }
      } else {
        // Retry if HubSpot library not ready
        setTimeout(createForm, 500);
      }
    };

    // Load HubSpot script
    const loadScript = () => {
      const existingScript = document.querySelector(
        `script[src="${scriptSrc}"]`
      );

      if (!existingScript) {
        const script = document.createElement("script");
        script.src = scriptSrc;
        script.charset = "utf-8";
        script.type = "text/javascript";

        script.onload = () => {
          // Try to create form after script loads
          setTimeout(createForm, 100);
        };

        script.onerror = () => {
          console.error("[HubSpotForm] Failed to load HubSpot script");
        };

        document.body.appendChild(script);
      } else {
        // Script exists, create form directly
        setTimeout(createForm, 100);
      }
    };

    loadScript();

    // Load Default.com script for enrichment
    window.__default__ = window.__default__ ?? {};
    window.__default__.form_id = 503792;
    window.__default__.team_id = 579;

    const defaultScript = document.createElement("script");
    defaultScript.async = true;
    defaultScript.src = "https://import-cdn.default.com";
    document.head.appendChild(defaultScript);

    // Cleanup function to handle component unmounting
    return () => {
      // Restore original console methods
      console.log = originalConsoleLog;
      console.info = originalConsoleInfo;
      // Reset submission flag for next mount
      submissionTracked = false;
    };
  }, []);

  return (
    <div
      id="hubspotForm"
      className="hs-form-html"
      data-region={region}
      data-form-id={formId}
      data-portal-id={portalId}
      data-default-form-id="503792"
    />
  );
}
