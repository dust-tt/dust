import { useEffect } from "react";

/**
 * Injects the Google Tag Manager script into the page.
 * Uses process.env.NEXT_PUBLIC_GTM_TRACKING_ID (compile-time substituted).
 */
export function useGTMScript() {
  useEffect(() => {
    const gtmId = process.env.NEXT_PUBLIC_GTM_TRACKING_ID;
    if (!gtmId) {
      return;
    }

    const script = document.createElement("script");
    script.id = "google-tag-manager";
    script.async = true;
    script.textContent = `
      (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','${gtmId}');
    `;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);
}
