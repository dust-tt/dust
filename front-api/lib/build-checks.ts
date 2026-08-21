// This production-build guard inspects esbuild's server metafile and fails the
// build if browser-only code leaks into front-api or a configured external is
// bundled anyway.

import type { Metafile } from "esbuild";

import { EXTERNAL_PACKAGES } from "../esbuild.shared";

const NODE_MODULES = "node_modules/";

// Browser-only packages. One value import from a server module is enough to pull
// any of these into the bundle, and they are pure startup cost there.
const BROWSER_ONLY_PACKAGES = [
  "@datadog/browser-core",
  "@datadog/browser-logs",
  "@datadog/browser-rum",
  "@dust-tt/sparkle",
  "@elevenlabs/react",
  "@heroicons/react",
  "@hookform/resolvers",
  "@marsidev/react-turnstile",
  "@novu/js",
  "@novu/react",
  "@radix-ui/react-dialog",
  "@radix-ui/react-label",
  "@radix-ui/react-select",
  "@radix-ui/react-slot",
  "@radix-ui/react-visually-hidden",
  "@stripe/react-stripe-js",
  "@stripe/stripe-js",
  "@tanstack/react-table",
  "@textea/json-viewer",
  "@tiptap/react",
  "@uiw/react-textarea-code-editor",
  "@virtuoso.dev/message-list",
  "cmdk",
  "emoji-mart",
  "framer-motion",
  "lucide-react",
  "motion",
  "next",
  "posthog-js",
  "react-cookie",
  "react-dropzone",
  "react-hook-form",
  "react-image-crop",
  "react-intersection-observer",
  "react-pdf",
  "react-phone-number-input",
  "react-resizable-panels",
  "react-svg-credit-card-payment-icons",
  "react-textarea-autosize",
  "recharts",
  "swr",
];

// react and react-dom are deliberately absent: @react-email/render uses them to
// render notification email templates on the server.

function packageOf(inputPath: string): string | null {
  const index = inputPath.lastIndexOf(NODE_MODULES);
  if (index < 0) {
    return null;
  }
  const parts = inputPath.slice(index + NODE_MODULES.length).split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

export function bundledPackages(metafile: Metafile): Set<string> {
  const packages = new Set<string>();
  for (const input of Object.keys(metafile.inputs)) {
    const name = packageOf(input);
    if (name) {
      packages.add(name);
    }
  }
  return packages;
}

/**
 * @cc [owner:id13,label:architecture;performance] no-browser-packages-in-front-api-bundle
 * The production front-api server bundle MUST exclude every package listed in
 * `BROWSER_ONLY_PACKAGES`.
 */
/**
 * Fails the build when the bundle swallows something that has to stay a real
 * module, or something that has no business running on a server at all.
 */
export function checkBundleContents(metafile: Metafile): string[] {
  const bundled = bundledPackages(metafile);
  const problems: string[] = [];

  for (const name of BROWSER_ONLY_PACKAGES) {
    if (bundled.has(name)) {
      problems.push(
        `${name} is browser-only and must not be reachable from front-api.`
      );
    }
  }

  const unused = EXTERNAL_PACKAGES.filter(
    (name) => !name.includes("*") && bundled.has(name)
  );
  if (unused.length > 0) {
    problems.push(
      `Listed as external but bundled anyway (stale entry?): ${unused.join(", ")}`
    );
  }

  return problems;
}
