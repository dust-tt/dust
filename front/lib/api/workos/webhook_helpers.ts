import type { Event } from "@workos-inc/node";

import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import type { Result } from "@app/types";
import { Ok } from "@app/types";

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

export async function validateWorkOSWebhookEvent(
  payload: unknown,
  { signatureHeader }: { signatureHeader: string }
): Promise<Result<Event, Error>> {
  const workOS = getWorkOS();

  const verifiedEvent = await workOS.webhooks.constructEvent({
    payload,
    sigHeader: signatureHeader,
    secret: config.getWorkOSWebhookSigningSecret(),
  });

  return new Ok(verifiedEvent);
}
