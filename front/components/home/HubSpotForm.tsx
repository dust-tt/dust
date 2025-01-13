import { useEffect } from "react";

export default function HubSpotForm() {
  useEffect(() => {
    // Add script dynamically
    const script = document.createElement("script");
    script.src = "https://js-eu1.hsforms.net/forms/embed/144442587.js";
    script.defer = true;
    document.body.appendChild(script);

    // Cleanup on unmount
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div
      className="hs-form-frame"
      data-region="eu1"
      data-form-id="31e790e5-f4d5-4c79-acc5-acd770fe8f84"
      data-portal-id="144442587"
    />
  );
}
