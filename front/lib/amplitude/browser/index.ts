import type { Ampli } from "@app/lib/amplitude/browser/generated";
import { ampli } from "@app/lib/amplitude/browser/generated";

let BROWSER_CLIENT: Ampli | null = null;

export function getBrowserClient() {
  if (BROWSER_CLIENT) {
    return BROWSER_CLIENT;
  }

  const disabled = !new URL(window.location.href).origin.startsWith(
    "https://dust.tt/"
  );
  ampli.load({
    environment: "dust",
    disabled: disabled,
  });
  BROWSER_CLIENT = ampli;

  return BROWSER_CLIENT;
}
