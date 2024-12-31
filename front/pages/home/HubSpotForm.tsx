import { useEffect } from 'react';

export function HubSpotForm() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "//js-eu1.hsforms.net/forms/embed/v2.js";
    script.charset = "utf-8";
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      if ((window as any).hbspt) {
        (window as any).hbspt.forms.create({
          portalId: "144442587",
          formId: "7cc5ca02-5547-42ca-98b5-80e5e3c422eb",
          target: "#hubspotForm"
        });
      }
    };

    return () => {
      script.remove();
    };
  }, []);

  return <div id="hubspotForm" />;
}
