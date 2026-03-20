import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function extractEmailAddressesFromHeader(
  headerValue: string | null
): string[] {
  if (!headerValue) {
    return [];
  }
  const addresses: string[] = [];
  const seen = new Set<string>();

  const addEmail = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!seen.has(email)) {
      seen.add(email);
      addresses.push(email);
    }
  };

  const anglePattern = /<([^>]+)>/g;
  let match;
  while ((match = anglePattern.exec(headerValue)) !== null) {
    const content = match[1].trim();
    if (content.includes("@") && !content.includes(" ")) {
      addEmail(content);
    }
  }

  const remaining = headerValue.replace(/<[^>]*>/g, " ");
  const barePattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  while ((match = barePattern.exec(remaining)) !== null) {
    addEmail(match[0]);
  }

  return addresses;
}

export function extractSingleEmailAddressFromHeader(
  headerName: string,
  headerValue: string | null
): Result<string, Error> {
  const addresses = extractEmailAddressesFromHeader(headerValue);

  if (addresses.length !== 1) {
    return new Err(
      new Error(`Expected exactly one mailbox in ${headerName} header`)
    );
  }

  return new Ok(addresses[0]);
}

export function parseHeaderValue(
  rawHeaders: string,
  headerName: string
): string | null {
  const escapedHeaderName = headerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerPattern = new RegExp(
    `^${escapedHeaderName}:\\s*((?:.*(?:\\r?\\n[ \\t]+.*)*))`,
    "im"
  );
  const match = rawHeaders.match(headerPattern);
  if (!match) {
    return null;
  }

  const unfoldedHeaderValue = match[1].replace(/\r?\n[ \t]+/g, " ").trim();

  return unfoldedHeaderValue.length > 0 ? unfoldedHeaderValue : null;
}
