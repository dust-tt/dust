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
