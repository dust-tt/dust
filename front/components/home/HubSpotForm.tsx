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
  const formId = "31e790e5-f4d5-4c79-acc5-acd770fe8f84";

  useEffect(() => {
    const scriptSrc = `https://js-${region}.hsforms.net/forms/embed/developer/${portalId}.js`;

    if (document.querySelector(`script[src="${scriptSrc}"]`)) {
      return;
    }

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.defer = true;

    script.onload = () => {
      const formContainer = document.getElementById("hubspotForm");
      if (!formContainer) {
        return;
      }

      // Detect when HubSpot renders the form
      const observer = new MutationObserver((mutations, obs) => {
        const form = formContainer.querySelector("form");
        if (form) {
          obs.disconnect();

          trackEvent({
            area: TRACKING_AREAS.CONTACT,
            object: "hubspot_form",
            action: "ready",
          });

          formContainer.addEventListener(
            "click",
            (e) => {
              const target = e.target as HTMLElement;

              const isButtonTag =
                target.tagName === "BUTTON" || target.tagName === "INPUT";
              const buttonElement = isButtonTag
                ? target
                : target.closest("button") ??
                  target.closest("input[type='submit']") ??
                  target.closest("input[type='button']");

              if (buttonElement) {
                const text = buttonElement.textContent?.toLowerCase() ?? "";
                const value =
                  (buttonElement as HTMLInputElement).value?.toLowerCase() ??
                  "";
                const className = buttonElement.className?.toLowerCase() ?? "";
                const buttonType = (
                  buttonElement as HTMLInputElement | HTMLButtonElement
                ).type;

                const contains = (keyword: string) =>
                  text.includes(keyword) ||
                  value.includes(keyword) ||
                  className.includes(keyword);

                if (contains("next")) {
                  trackEvent({
                    area: TRACKING_AREAS.CONTACT,
                    object: "hubspot_form",
                    action: "next_step",
                  });
                } else if (contains("previous") || contains("back")) {
                  trackEvent({
                    area: TRACKING_AREAS.CONTACT,
                    object: "hubspot_form",
                    action: "previous_step",
                  });
                } else if (buttonType === "submit" || contains("submit")) {
                  trackEvent({
                    area: TRACKING_AREAS.CONTACT,
                    object: "hubspot_form",
                    action: TRACKING_ACTIONS.SUBMIT,
                  });
                }
              }
            },
            true
          );
        }
      });

      observer.observe(formContainer, {
        childList: true,
        subtree: true,
      });
    };

    script.onerror = () => {
      trackEvent({
        area: TRACKING_AREAS.CONTACT,
        object: "hubspot_form",
        action: "script_load_error",
      });
    };

    document.body.appendChild(script);

    // Load Default.com script
    window.__default__ = window.__default__ || {};
    window.__default__.form_id = 503792;
    window.__default__.team_id = 579;
    window.__default__.listenToIds = [`hubspotForm-${formId}`];

    const loadDefaultScript = (attempt = 0) => {
      const defaultScript = document.createElement("script");
      defaultScript.async = true;
      defaultScript.src = "https://import-cdn.default.com";
      defaultScript.onload = () => {
        console.info("[Default.com] Powered by Default.com");
      };
      defaultScript.onerror = () => {
        if (attempt < 3) {
          setTimeout(() => loadDefaultScript(attempt + 1), 1000 * (attempt + 1));
        }
      };
      document.head.appendChild(defaultScript);
    };

    loadDefaultScript();
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
