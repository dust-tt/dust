import type { Ampli } from "@app/lib/amplitude/back/generated";
import { ampli } from "@app/lib/amplitude/back/generated";

let BACKEND_CLIENT: Ampli | null = null;

const { AMPLITUDE_ENABLED } = process.env;

export function getBackendClient() {
  if (BACKEND_CLIENT) {
    return BACKEND_CLIENT;
  }

  const disabled = !(AMPLITUDE_ENABLED === "true");
  ampli.load({
    environment: "dust",
    disabled: disabled,
  });
  BACKEND_CLIENT = ampli;

  return BACKEND_CLIENT;
}
