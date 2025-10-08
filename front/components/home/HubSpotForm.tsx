import React, { useEffect } from "react";

import { trackEvent, TRACKING_ACTIONS, TRACKING_AREAS } from "@app/lib/tracking";

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
  }
}

export default function HubSpotForm() {
  const region = "eu1";
  const portalId = "144442587";
  const formId = "31e790e5-f4d5-4c79-acc5-acd770fe8f84";

  useEffect(() => {
    const existingScript = document.getElementById("hubspot-script");
    const createForm = () => {
      if (window.hbspt && window.hbspt.forms && window.hbspt.forms.create) {
        window.hbspt.forms.create({
          region,
          portalId,
          formId,
          target: "#hubspotForm",
          onFormReady: ($form) => {
            trackEvent({
              area: TRACKING_AREAS.CONTACT,
              object: "hubspot_form",
              action: "ready",
            });

            // Track step navigation
            if ($form && typeof $form === "object" && "on" in $form) {
              const form = $form as {
                on: (event: string, handler: () => void) => void;
                find: (selector: string) => {
                  on: (event: string, handler: () => void) => void;
                };
              };

              // Track next/previous button clicks for multi-step form
              form.find(".hs-button.next-button").on("click", () => {
                trackEvent({
                  area: TRACKING_AREAS.CONTACT,
                  object: "hubspot_form",
                  action: "next_step",
                });
              });

              form.find(".hs-button.previous-button").on("click", () => {
                trackEvent({
                  area: TRACKING_AREAS.CONTACT,
                  object: "hubspot_form",
                  action: "previous_step",
                });
              });
            }
          },
          onFormSubmitted: () => {
            trackEvent({
              area: TRACKING_AREAS.CONTACT,
              object: "hubspot_form",
              action: TRACKING_ACTIONS.SUBMIT,
            });
          },
        });
      }
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "hubspot-script";
      script.src = `https://js-${region}.hsforms.net/forms/embed/developer/${portalId}.js`;
      script.defer = true;
      script.onload = createForm;
      document.body.appendChild(script);
    } else {
      createForm();
    }
  }, []);

  return (
    <div
      id="hubspotForm"
      className="hs-form-html"
      data-region={region}
      data-form-id={formId}
      data-portal-id={portalId}
    />
  );
}
