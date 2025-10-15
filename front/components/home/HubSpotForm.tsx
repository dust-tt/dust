import React, { useEffect } from "react";

import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";

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

    // Simple tracking setup function
    const setupTracking = () => {
      const container = document.getElementById("hubspotForm");
      if (!container) return;

      // Track form ready
      trackEvent({
        area: TRACKING_AREAS.CONTACT,
        object: "hubspot_form",
        action: "ready",
      });

      // Add submit tracking via multiple methods

      // Method 1: Direct form submit listener
      const form = container.querySelector("form");
      if (form) {
        form.addEventListener("submit", () => {
          trackEvent({
            area: TRACKING_AREAS.CONTACT,
            object: "hubspot_form",
            action: "submitted",
          });
        }, true);
      }

      // Method 2: Watch for success message
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const addedNodes = Array.from(mutation.addedNodes);
          const hasSuccessIndicator = addedNodes.some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              const text = element.textContent?.toLowerCase() || "";
              return text.includes("thank") || text.includes("success") || text.includes("submitted");
            }
            return false;
          });

          if (hasSuccessIndicator) {
            trackEvent({
              area: TRACKING_AREAS.CONTACT,
              object: "hubspot_form",
              action: "submitted",
            });
            observer.disconnect();
            break;
          }
        }
      });

      observer.observe(container, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 30000); // Cleanup after 30s
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
      if (existingForm || existingIframe) {
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
            trackEvent({
              area: TRACKING_AREAS.CONTACT,
              object: "hubspot_form",
              action: "submitted",
            });
          },
        });

        // Use MutationObserver as fallback if onFormReady doesn't fire
        const observer = new MutationObserver((mutations, obs) => {
          const container = document.getElementById("hubspotForm");
          if (!container) return;

          const form = container.querySelector("form");
          const iframe = container.querySelector("iframe");

          if (form || iframe) {
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
      const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);

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
      // Don't clear the form container on unmount - let React handle it
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
