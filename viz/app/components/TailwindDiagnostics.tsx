"use client";

import { observeMissingTailwindClasses } from "@viz/app/lib/tailwind-diagnostics";
import { useEffect } from "react";
import { z } from "zod";

const CoverageReportSchema = z.object({
  buildId: z.string(),
  stylesheets: z.array(z.string()).min(1),
  missingClasses: z.array(z.string()),
});

export function TailwindDiagnostics({ identifier }: { identifier: string }) {
  useEffect(() => {
    const controller = new AbortController();
    let stopObserving: (() => void) | undefined;

    const start = async () => {
      let data: unknown;
      try {
        const response = await fetch("/tailwind-coverage.json", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        data = await response.json();
      } catch {
        // Diagnostics are optional when offline, aborted, or using a dev server.
        return;
      }
      const coverage = CoverageReportSchema.safeParse(data);
      if (!coverage.success || controller.signal.aborted) {
        return;
      }

      // An open tab can fetch a report from a newer deployment. Only observe
      // when its stylesheet hashes match the CSS loaded by this page.
      const loadedStylesheets = new Set(
        Array.from(
          document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
        ).map((link) => new URL(link.href).pathname.split("/").pop())
      );
      if (
        !coverage.data.stylesheets.every((filename) =>
          loadedStylesheets.has(filename)
        )
      ) {
        return;
      }

      // Include portals as well as the Runner subtree, without scanning Frame source.
      stopObserving = observeMissingTailwindClasses(
        document.body,
        coverage.data.missingClasses,
        (classNames) => {
          window.parent.postMessage(
            {
              type: "TAILWIND_MISSING_CLASSES",
              identifier,
              buildId: coverage.data.buildId,
              classNames,
            },
            "*"
          );
        }
      );
    };
    void start();
    return () => {
      controller.abort();
      stopObserving?.();
    };
  }, [identifier]);

  return null;
}
