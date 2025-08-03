import React, { useEffect, useState } from "react";

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
      identify: (data: { email: string; name?: string }) => void;
    };
    dataLayer?: any[];
  }
}

export default function HubSpotForm() {
  const [signalsReady, setSignalsReady] = useState(false);

  // Monitor signals availability
  useEffect(() => {
    console.log("Initial signals check:", !!window.signals);

    const checkSignalsInterval = setInterval(() => {
      if (window.signals) {
        console.log("✅ Signals detected");
        setSignalsReady(true);
        clearInterval(checkSignalsInterval);
      }
    }, 100);

    return () => clearInterval(checkSignalsInterval);
  }, []);

  // Set up message listener for form submission
  useEffect(() => {
    console.log("Setting up form submission listener");

    const handleFormSubmission = (event: MessageEvent) => {
      console.log("Form submission event:", event);
      if (
        event.data.type === "hsFormCallback" &&
        event.data.eventName === "onFormSubmitted"
      ) {
        console.log("🎉 HubSpot form submitted via event!", event.data);

        // Push to dataLayer
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: "hubspot-form-success",
          "hs-form-guid": event.data.id,
        });
        console.log("📊 Pushed to dataLayer");

        // Extract email from submission values
        const email = event.data.data?.submissionValues?.email;

        console.log("Form submission processing:", {
          email,
          signalsReady,
          signalsAvailable: !!window.signals,
        });

        if (email && window.signals) {
          try {
            window.signals.identify({ email });
            console.log("✅ Successfully identified user with email:", email);
          } catch (error) {
            console.error("❌ Error identifying user:", error);
          }
        } else {
          console.warn("⚠️ Cannot identify user:", {
            hasEmail: !!email,
            hasSignals: !!window.signals,
            signalsReady,
          });
        }
      }
    };

    window.addEventListener("message", handleFormSubmission);

    return () => {
      window.removeEventListener("message", handleFormSubmission);
    };
  }, [signalsReady]);

  // Create HubSpot form
  useEffect(() => {
    const existingScript = document.getElementById("hubspot-script");

    const createForm = () => {
      console.log("Creating HubSpot form...");

      if (window.hbspt?.forms?.create) {
        window.hbspt.forms.create({
          region: "eu1",
          portalId: "144442587",
          formId: "31e790e5-f4d5-4c79-acc5-acd770fe8f84",
          target: "#hubspotForm",
          onFormSubmitted: (form) => {
            console.log("🎉 HubSpot form submitted via callback!", form);
          },
        });
        console.log("✅ Form creation initiated");
      } else {
        console.error("❌ HubSpot forms API not available");
      }
    };

    if (!existingScript) {
      console.log("Loading HubSpot script...");
      const script = document.createElement("script");
      script.id = "hubspot-script";
      script.src = "https://js-eu1.hsforms.net/forms/v2.js";
      script.defer = true;
      script.onload = () => {
        console.log("✅ HubSpot script loaded");
        createForm();
      };
      script.onerror = (error) => {
        console.error("❌ Error loading HubSpot script:", error);
      };
      document.body.appendChild(script);
    } else {
      console.log("HubSpot script already exists");
      createForm();
    }
  }, []);

  return (
    <div>
      <div id="hubspotForm" />
      {process.env.NODE_ENV === "development" && (
        <div style={{ fontSize: "12px", color: "#666", marginTop: "10px" }}>
          <div>Signals: {signalsReady ? "✅ Ready" : "⏳ Loading..."}</div>
          <button
            onClick={() => {
              console.log("Current state:", {
                signalsReady,
                windowSignals: !!window.signals,
                hubspotAvailable: !!window.hbspt?.forms,
              });
            }}
            style={{ marginTop: "10px" }}
          >
            Debug State
          </button>
        </div>
      )}
    </div>
  );
}
