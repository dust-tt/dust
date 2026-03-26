import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const EMAIL_ADDRESS_PATTERN_SOURCE =
  "[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}";
const FULL_EMAIL_ADDRESS_PATTERN = new RegExp(
  `^${EMAIL_ADDRESS_PATTERN_SOURCE}$`
);
const GLOBAL_EMAIL_ADDRESS_PATTERN = new RegExp(
  EMAIL_ADDRESS_PATTERN_SOURCE,
  "g"
);

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

  // First pass: extract addresses inside angle brackets (e.g., "Name <email@domain.com>").
  // This correctly handles display names with special characters (apostrophes, quotes, etc.)
  // and ensures case-insensitive matching by lowercasing here.
  const anglePattern = /<([^>]+)>/g;
  let match;
  while ((match = anglePattern.exec(headerValue)) !== null) {
    const content = match[1].trim();
    if (FULL_EMAIL_ADDRESS_PATTERN.test(content)) {
      addEmail(content);
    }
  }

  // Second pass: extract bare email addresses from parts without angle brackets.
  const remaining = headerValue.replace(/<[^>]*>/g, " ");
  while ((match = GLOBAL_EMAIL_ADDRESS_PATTERN.exec(remaining)) !== null) {
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
  // Match the header name at line start, capture the first line value then any
  // RFC 5322 folded continuation lines (lines starting with whitespace).
  const headerPattern = new RegExp(
    `^${escapedHeaderName}:\\s*((?:.*(?:\\r?\\n[ \\t]+.*)*))`,
    "im"
  );
  const match = rawHeaders.match(headerPattern);
  if (!match) {
    return null;
  }

  // Unfold RFC 5322 continuation lines (CRLF/LF followed by spaces/tabs).
  const unfoldedHeaderValue = match[1].replace(/\r?\n[ \t]+/g, " ").trim();

  return unfoldedHeaderValue.length > 0 ? unfoldedHeaderValue : null;
}
