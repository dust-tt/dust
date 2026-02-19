import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { ActionContext, Event } from "@workos-inc/node";

// WorkOS sends webhooks from a fixed set of IP addresses.
const workosIpAddresses = [
  "3.217.146.166",
  "23.21.184.92",
  "34.204.154.149",
  "44.213.245.178",
  "44.215.236.82",
  "50.16.203.9",
  "52.1.251.34",
  "52.21.49.187",
  "174.129.36.47",
];

export function isWorkOSIpAddress(ipAddress: string) {
  return workosIpAddresses.includes(ipAddress);
}

/**
 * Extracts the client IP address from request headers.
 * Handles x-forwarded-for header which can contain comma-separated IPs from proxy chains.
 * Returns the first IP (original client) or null if no forwarded header exists.
 */
export function getClientIpFromHeaders(headers: {
  [key: string]: string | string[] | undefined;
}): string | null {
  const forwardedFor = headers["x-forwarded-for"];
  if (forwardedFor) {
    const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ip.split(",")[0].trim();
  }
  return null;
}

export async function validateWorkOSWebhookEvent(
  payload: unknown,
  { signatureHeader }: { signatureHeader: string }
): Promise<Result<Event, Error>> {
  const workOS = getWorkOS();

  try {
    const verifiedEvent = await workOS.webhooks.constructEvent({
      payload,
      sigHeader: signatureHeader,
      secret: config.getWorkOSWebhookSigningSecret(),
    });

    return new Ok(verifiedEvent);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function validateWorkOSActionEvent(
  payload: unknown,
  { signatureHeader }: { signatureHeader: string }
): Promise<Result<ActionContext, Error>> {
  const workOS = getWorkOS();

  try {
    const verifiedEvent = await workOS.actions.constructAction({
      payload,
      sigHeader: signatureHeader,
      secret: config.getWorkOSActionSigningSecret(),
    });

    return new Ok(verifiedEvent);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
