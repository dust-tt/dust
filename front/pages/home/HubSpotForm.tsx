import { useEffect } from "react";

export function HubSpotForm() {
  useEffect(() => {
    console.log("Component mounted");

    // Create the script
    const script = document.createElement("script");
    script.innerHTML = `
      hbspt.forms.create({
        region: "eu1",
        portalId: "144442587",
        formId: "31e790e5-f4d5-4c79-acc5-acd770fe8f84",
        target: "#hubspotForm"
      });
    `;

    // Add the main HubSpot script
    const hubspotScript = document.createElement("script");
    hubspotScript.src = "https://js-eu1.hsforms.net/forms/embed/v2.js";
    hubspotScript.defer = true;

    hubspotScript.onload = () => {
      console.log("HubSpot script loaded");
      document.body.appendChild(script);
    };

    document.body.appendChild(hubspotScript);

    return () => {
      hubspotScript.remove();
      script.remove();
      const formContainer = document.getElementById("hubspotForm");
      if (formContainer) {
        formContainer.innerHTML = "";
      }
    };
  }, []);

  return (
    <div
      id="hubspotForm"
      style={{
        minHeight: "400px",
        border: "0px solid #ccc",
        padding: "0px",
      }}
    />
  );
}
