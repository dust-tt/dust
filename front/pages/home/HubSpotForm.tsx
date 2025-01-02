"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    hbspt: {
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

export function HubSpotForm() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const script = document.createElement("script");
    script.src = "//js-eu1.hsforms.net/forms/embed/v2.js";
    script.async = true;
    script.onload = () => {
      if (window.hbspt) {
        window.hbspt.forms.create({
          region: "eu1",
          portalId: "144442587",
          formId: "7cc5ca02-5547-42ca-98b5-80e5e3c422eb",
          target: "#hubspotForm",
        });
      }
    };

    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
      const formContainer = document.getElementById("hubspotForm");
      if (formContainer) {
        formContainer.innerHTML = "";
      }
    };
  }, []);

  if (!isMounted) {
    return null;
  }

  return <div id="hubspotForm" />;
}
