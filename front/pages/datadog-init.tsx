import { datadogRum } from "@datadog/browser-rum";

if (process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN) {
  datadogRum.init({
    applicationId: "5e9735e7-87c8-4093-b09f-49d708816bfd",
    clientToken: process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN,
    site: "datadoghq.eu",
    service: `${process.env.NEXT_PUBLIC_DATADOG_SERVICE || "front"}-browser`,
    env: process.env.NODE_ENV === "production" ? "prod" : "dev",
    version: process.env.NEXT_PUBLIC_COMMIT_HASH || "",
    sessionSampleRate: 20,
    sessionReplaySampleRate: 5,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: "mask-user-input",
    allowedTracingUrls: [
      "https://dust.tt",
      "https://eu.dust.tt",
      "https://front-edge.dust.tt",
      "https://eu.front-edge.dust.tt",
    ],
    traceSampleRate: 5,
    traceContextInjection: "sampled" as const,
    beforeSend: (event: any) => {
      if (
        event.type === "action" &&
        event.action &&
        event.action.target &&
        event.action.type === "click"
      ) {
        if (
          event._dd &&
          event._dd.action &&
          event._dd.action.name_source === "text_content"
        ) {
          const elSelector =
            event._dd.action.target && event._dd.action.target.selector;
          if (elSelector && typeof elSelector === "string") {
            try {
              const el = document.querySelector(elSelector);
              if (el) {
                const parentWithPrivacyMask = el.closest(".dd-privacy-mask");
                if (parentWithPrivacyMask) {
                  // Initially redact with a generic string
                  event.action.target.name =
                    "[text element within dd-privacy-mask]";
                  // Now attempt to provide a better, less generic name, still respecting privacy
                  const buttonParent = el.closest("button");
                  if (buttonParent) {
                    const ariaLabel = buttonParent.getAttribute("aria-label");
                    if (ariaLabel) {
                      event.action.target.name = ariaLabel; // More specific, but still protecting privacy
                    }
                  }
                }
              }
            } catch (error) {
              // Invalid selector - silently ignore
            }
          }
        }
      }
      return true;
    },
  });
}

export default function DatadogInit() {
  // Render nothing - this component is only included so that the init code
  // above will run client-side
  return null;
}
