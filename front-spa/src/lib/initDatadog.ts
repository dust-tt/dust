/**
 * Initialize Datadog RUM (Real User Monitoring)
 * This should be called early in the app initialization
 */
export function initDatadogRUM() {
  const clientToken = import.meta.env.VITE_DATADOG_CLIENT_TOKEN;

  // Only initialize if we have a client token
  if (!clientToken || !window.DD_RUM) {
    return;
  }

  window.DD_RUM.onReady(() => {
    window.DD_RUM?.init({
      clientToken,
      applicationId: "5e9735e7-87c8-4093-b09f-49d708816bfd",
      site: "datadoghq.eu",
      service: `${import.meta.env.VITE_DATADOG_SERVICE || "front"}-browser`,
      env: import.meta.env.MODE === "production" ? "prod" : "dev",
      version: import.meta.env.VITE_COMMIT_HASH || "",
      allowedTracingUrls: [
        "https://dust.tt",
        "https://eu.dust.tt",
        "https://front-edge.dust.tt",
        "https://eu.front-edge.dust.tt",
      ],
      traceSampleRate: 5,
      traceContextInjection: "sampled",
      sessionSampleRate: 100,
      sessionReplaySampleRate: 5,
      defaultPrivacyLevel: "mask-user-input",
      beforeSend: (event) => {
        // This error is benign, happens often in the wild but has 0 effect on the user.
        // See: https://github.com/DataDog/browser-sdk/issues/1616.
        if (
          event.type === "error" &&
          event.error?.message?.includes(
            "ResizeObserver loop completed with undelivered notifications"
          )
        ) {
          return false;
        }

        // Mask click actions within privacy-masked elements
        if (
          event.type === "action" &&
          event.action?.target &&
          event.action?.type === "click"
        ) {
          const ddContext = (
            event as {
              _dd?: {
                action?: {
                  name_source?: string;
                  target?: { selector?: string };
                };
              };
            }
          )._dd;
          if (ddContext?.action?.name_source === "text_content") {
            const elSelector = ddContext.action.target?.selector;
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
                        event.action.target.name = ariaLabel;
                      }
                    }
                  }
                }
              } catch {
                // Invalid selector - silently ignore
              }
            }
          }
        }

        return true;
      },
    });
  });
}
