import React, { useEffect } from "react";

declare global {
  interface Window {
    hbspt?: {
      forms: {
        create: (config: {
          region: string;
          portalId: string;
          formId: string;
          target: string;
          onFormSubmitted?: (form: any) => void;
        }) => void;
      };
    };
    signals?: {
      form: (event: string, data: Record<string, any>) => void;
    } & any[];
  }
}

export default function HubSpotForm() {
  useEffect(() => {
    const existingScript = document.getElementById("hubspot-script");
    const createForm = () => {
      if (window.hbspt && window.hbspt.forms && window.hbspt.forms.create) {
        window.hbspt.forms.create({
          region: "eu1",
          portalId: "144442587",
          formId: "31e790e5-f4d5-4c79-acc5-acd770fe8f84",
          target: "#hubspotForm",
          onFormSubmitted: (form) => {
            // Track form submission in CommonRoom if it exists
            if (window.signals && typeof window.signals.form === "function") {
              window.signals.form("hubspot_contact_form_submitted", {
                formId: form.formId,
                portalId: form.portalId,
              });
            }
          },
        });
      }
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "hubspot-script";
      script.src = "https://js-eu1.hsforms.net/forms/v2.js";
      script.defer = true;
      script.onload = createForm;
      document.body.appendChild(script);
    } else {
      // If the script is already present, just recreate the form
      createForm();
    }
  }, []);
  return <div id="hubspotForm" />;
}
