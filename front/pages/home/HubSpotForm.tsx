import { useEffect, useState } from "react";

declare global {
  interface Window {
    hbspt: any;
  }
}

export function HubSpotForm() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const formContainer = document.getElementById("hubspotForm");
    let formCreated = false;

    const createForm = () => {
      if (!formCreated && window.hbspt) {
        formCreated = true;
        try {
          window.hbspt.forms.create({
            region: "eu1",
            portalId: "144442587",
            formId: "31e790e5-f4d5-4c79-acc5-acd770fe8f84",
            target: "#hubspotForm",
          });
          setTimeout(() => setIsLoading(false), 500);
        } catch (e) {
          setError("Failed to load form");
          setIsLoading(false);
        }
      }
    };

    const script = document.createElement("script");
    script.src = "https://js-eu1.hsforms.net/forms/embed/v2.js";
    script.defer = true;

    script.addEventListener("load", createForm);
    script.addEventListener("error", () => {
      setError("Failed to load HubSpot script");
      setIsLoading(false);
    });

    document.body.appendChild(script);

    return () => {
      script.removeEventListener("load", createForm);
      if (formContainer) {
        formContainer.innerHTML = "";
      }
      document.body.removeChild(script);
      formCreated = false;
    };
  }, []);

  return (
    <>
      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : !error ? (
        <div id="hubspotForm" className="min-h-96" />
      ) : (
        <div className="flex h-full flex-col gap-3 text-center">
          There was an error loading the contact form.
        </div>
      )}
    </>
  );
}
