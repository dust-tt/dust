"use client";

import { cn } from "@viz/lib/utils";
import { useEffect, useId, useState } from "react";

export interface MermaidProps {
  /** Mermaid diagram source, for example `flowchart LR\n  A --> B`. */
  chart: string;
  className?: string;
}

const LIGHT_THEME_VARIABLES = {
  background: "#ffffff",
  textColor: "#1f2937",
  primaryColor: "#e0f2fe",
  primaryTextColor: "#075985",
  primaryBorderColor: "#7dd3fc",
  secondaryColor: "#dcfce7",
  secondaryTextColor: "#166534",
  secondaryBorderColor: "#86efac",
  tertiaryColor: "#f9fafb",
  tertiaryTextColor: "#4b5563",
  tertiaryBorderColor: "#e5e7eb",
  lineColor: "#9ca3af",
  clusterBkg: "#f9fafb",
  clusterBorder: "#d1d5db",
  edgeLabelBackground: "#ffffff",
  noteBkgColor: "#fffbeb",
  noteTextColor: "#1f2937",
};

const DARK_THEME_VARIABLES = {
  background: "#0a0a0a",
  textColor: "#e5e7eb",
  primaryColor: "#0c4a6e",
  primaryTextColor: "#e0f2fe",
  primaryBorderColor: "#0369a1",
  secondaryColor: "#14532d",
  secondaryTextColor: "#dcfce7",
  secondaryBorderColor: "#15803d",
  tertiaryColor: "#171717",
  tertiaryTextColor: "#d1d5db",
  tertiaryBorderColor: "#404040",
  lineColor: "#737373",
  clusterBkg: "#171717",
  clusterBorder: "#404040",
  edgeLabelBackground: "#0a0a0a",
  noteBkgColor: "#422006",
  noteTextColor: "#e5e7eb",
};

type MermaidState =
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

/**
 * @cc [owner:flvndvd,label:product] frame-mermaid-component
 * Frames MUST get Mermaid only through this component, which MUST lazy-load the library so Frames
 * without diagrams do not pay for it. The diagram source MUST be a prop, never children, because
 * inline text editing rewrites JSX text. Invalid sources MUST render a visible error, not throw.
 */
export function Mermaid({ chart, className }: MermaidProps) {
  const id = `mermaid-${useId().replaceAll(":", "")}`;
  const [state, setState] = useState<MermaidState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        const isDark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            fontFamily: "inherit",
            fontSize: "14px",
            ...(isDark ? DARK_THEME_VARIABLES : LIGHT_THEME_VARIABLES),
          },
          flowchart: { htmlLabels: false, useMaxWidth: true },
          sequence: { useMaxWidth: true },
          gantt: { useMaxWidth: true },
        });
        await mermaid.parse(chart);
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) {
          setState({ status: "ready", svg });
        }
      } catch (error) {
        // Mermaid leaves its error SVG attached to the body when a render fails.
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (state.status === "error") {
    return (
      <pre
        role="alert"
        className={cn(
          "overflow-auto rounded-lg border border-destructive p-3 text-xs text-destructive",
          className
        )}
      >
        {state.message}
      </pre>
    );
  }

  return (
    <div
      className={cn("flex w-full justify-center", className)}
      aria-busy={state.status === "loading"}
      dangerouslySetInnerHTML={{
        __html: state.status === "ready" ? state.svg : "",
      }}
    />
  );
}
